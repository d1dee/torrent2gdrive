const axios = require('axios'), {TMDB_API} = process.env;
const fs = require("fs");
const {path} = require("file");

let tmdb_config = JSON.parse(fs.readFileSync(path.join(__dirname, 'tmdb.json'), {encoding: 'utf8'}))
const {images: {secure_base_url}} = tmdb_config[0], {genres} = tmdb_config[1]
const log = require('loglevel');
/**
 *
 * @param query {String || Object} if a string is supplied, this will be the search term to request from TMDB.
 * When an object is supplied it should contain {TMDB id, media_type}
 * @returns {Promise <resolve, reject>} Rejects with error
 */

exports.movieIndex = async (query) => {
    const {tmdb_id, media_type} = query
    log.info(query)
    if (tmdb_id && media_type) {
        return new Promise(async (resolve, reject) => {
            let data
            if (media_type === 'movie') {
                await axios.get(`https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${TMDB_API}&language=en-US`)
                    .then((response) => {
                        data = response.data
                    }).catch(err => {
                        log.error(err);
                        reject({axios_error: true})
                    })
            } else if (media_type === 'tv') {
                await axios.get(`https://api.themoviedb.org/3/tv/${tmdb_id}?api_key=${TMDB_API}&language=en-US`)
                    .then((response) => {
                        data = response.data
                    })
                    .catch(err => {
                        log.error(err);
                        reject({axios_error: true})
                    })
            }
            const {
                first_air_date,
                original_name,
                genres,
                runtime,
                belongs_to_collection,
                networks,
                next_episode_to_air,
                poster_path,
                status,
                in_production,
                number_of_seasons,
                release_date,
                last_air_date,
                overview,
                tagline,
                adult,
                popularity,
                original_title,
                original_language,
                name,
                title,
                last_episode_to_air,
                imdb_id,
                vote_average
            } = data;
            let genre = genres.map((element) => element.name)
            !data ? reject({message: 'No response received', code: 1}) : resolve({
                media_type,
                adult,
                belongs_to_collection,
                genres: genre,
                tmdb_id,
                imdb_id,
                original_language,
                overview,
                poster_path: secure_base_url + '/original/' + poster_path,
                popularity,
                release_date: release_date || first_air_date,
                runtime,
                status,
                tagline,
                vote_average,
                in_production,
                last_air_date,
                last_episode_to_air,
                next_episode_to_air,
                networks,
                number_of_seasons,
                original_title: original_title || original_name,
                title: title || name
            })
        })
    } else {
        return new Promise((resolve, reject) => {
            multiSearch(query.toString().trim())
                .then((results) => {
                    let return_data = []
                    function returnData(element) {
                        return_data.push({
                            adult: element.adult,
                            tmdb_id: element.id,
                            backdrop_path: element.backdrop_path,
                            genre: genre_to_string(element.genre_ids),
                            original_language: element.original_language,
                            original_title: element.original_title || element.original_name,
                            overview: element.overview,
                            popularity: element.popularity,
                            poster_path: secure_base_url + '/original/' + element.poster_path,
                            release_date: element.release_date || element.first_air_date,
                            title: element.title || element.name,
                            vote_average: element.vote_average,
                            media_type: element.release_date ? 'movie' : 'tv'
                        })
                    }

                    results.forEach((element) => {
                        if (element.media_type === 'person') return

                        (results.length > 5)
                            ? (element.popularity > 20)
                                ? returnData(element)
                                : Date.parse(element.release_date ? element.release_date : element.first_air_date) > Date.now()
                                    ? returnData(element)
                                    : null
                            : returnData(element)
                    })
                    return_data = return_data.sort((a, b) => {
                        return b.popularity - a.popularity
                    })
                    return_data.length === 0 ? reject({
                        message: `No results found for ${query}`
                    }) : resolve(return_data)
                })
                .catch(err => {
                    log.error(err)
                    reject({message: err.message})
                })
        })
    }
}


async function multiSearch(query) {
    return new Promise((resolve, reject) => {
        let year = (query.match(/\d{4}$/g))
        year
            ? query.match(/[a-z^\W]{3}/gmi)
                ? query = query.replace(year.toString(), '')
                : year = ''
            : null
        let promise = []
        promise.push(axios.get(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API}&language=en-US&page=1&query=${query}&include_adult=false&${year ? 'year=' + year.toString() : ''}`))
        promise.push(axios.get(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API}&language=en-US&page=1&query=${query}&include_adult=false&${year ? 'first_air_date_year=' + year.toString : ''}`))

        Promise.all(promise)
            .then((response) => {
                let result = response.map((element) => {
                    return element.data.results
                }).flat()
                !result.length ? reject({message: 'No response received', code: 1}) : null
                resolve(year
                    ? result.filter((element) => {
                        let release_year = element.first_air_date
                            ? element.first_air_date
                            : element.release_date
                        return release_year
                            ? (release_year.match(new RegExp('^' + year, 'g')))
                                ? element
                                : undefined
                            : undefined
                    })
                    : result
                )
            })
            .catch(err => {
                reject({
                    message: 'Axios Error',
                    error: err
                })
            })
    })
}

/**
 * @param query {String} Search term
 * @param site {String=} Used when searching in a specific site
 * @returns {Promise<*[]>}
 */
exports.torrentDownload = async (query, site) => {
    return new Promise((resolve, reject) => {
        let return_data = []
        if (!site) site = 'all'
        axios.get(`https://d1dee-api-d1dee.koyeb.app/api/${site}/${encodeURI(query)}`)
            .then(({data}) => {
                let flat_data = (Array.isArray(data))
                    ? data.flat(1)
                    : [data]
                flat_data.forEach((element) => {
                    if (!element) return
                    const {DateUploaded, Leechers, Magnet, Name, Seeders, Size, UploadedBy, Category} = element
                    if (!(/^magnet:\?/i.test(Magnet)) || !Seeders || !Name || !Size ||
                        parseInt(Seeders) < 20 || parseInt(Seeders) > 10000 || parseInt(Seeders) < parseInt(Leechers)) return
                    return_data.push({
                        name: Name,
                        size: Size,
                        age: DateUploaded ? DateUploaded : '',
                        seeds: Seeders,
                        magnet: Magnet,
                        provider: UploadedBy ? UploadedBy : '',
                        leeches: Leechers ? Leechers : '',
                        type: Category ? Category : ''
                    })
                })
                log.info('Got ', return_data.length, ' for ', query)
                resolve((return_data.sort((a, b) => {
                    return b.seeds - a.seeds;
                })).slice(0, 50))
            })
            .catch(err => reject({message: err}))
    })
}

/**
 *
 * @param genre_ids {[Number]} Genre ids to match to
 * @returns {*[String]} Return an array that match with genre id supplied
 */
function genre_to_string(genre_ids) {
    let genre_string = []
    genre_ids ?
        genre_ids.forEach((element) => {
            const {id} = element;
            if (id) element = id
            genre_string.push(genres.find(genre => element === genre.id) ? genres.find(genre => element === genre.id).name : '')
        }) : ''
    return genre_string
}
