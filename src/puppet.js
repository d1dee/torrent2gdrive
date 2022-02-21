const axios = require('axios'), {TMDB_API} = process.env;
const fs = require("fs");
const {path} = require("file");

let tmdb_config = JSON.parse(fs.readFileSync(path.join(__dirname, 'tmdb.json'), {encoding: 'utf8'}))
const {images: {secure_base_url}} = tmdb_config[0], {genres} = tmdb_config[1]

exports.movieIndex = async (query) => {
    const {id, media_type} = query
    if (id && media_type) {
        console.log('matching query')
        return new Promise(async (resolve, reject) => {
            let data
            if (media_type === 'movie') {
                await axios.get(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API}&language=en-US`)
                    .then((response) => {
                        data = response.data
                    }).catch(err => {
                        console.log(err.message);
                        reject(err.message)
                    })
            } else if (media_type === 'tv') {
                await axios.get(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API}&language=en-US`)
                    .then((response) => {
                        data = response.data
                    })
                    .catch(err => {
                        console.log(err.message);
                        reject(err.message)
                    })
            }

            !data ? reject({message: 'No response received'}) : resolve({
                media_type: media_type,
                adult: data.adult,
                belongs_to_collection: data.belongs_to_collection,
                genres: genre_to_string(data.genres),
                id: data.id,
                imdb_id: data.imdb_id,
                original_language: data.original_language,
                original_title: data.original_title,
                overview: data.overview,
                poster_path: secure_base_url + '/original/' + data.poster_path,
                popularity: data.popularity,
                release_date: data.release_date,
                runtime: data.runtime,
                status: data.status,
                tagline: data.tagline,
                vote_average: data.vote_average,
                first_air_date: data.first_air_date,
                in_production: data.in_production,
                last_air_date: data.last_air_date,
                last_episode_to_air: data.last_episode_to_air,
                name: data.name,
                next_episode_to_air: data.next_episode_to_air,
                networks: data.networks,
                number_of_seasons: data.number_of_seasons,
                original_name: data.original_name,
                title: data.title
            })
        })
    } else {
        return new Promise((resolve, reject) => {
            axios.get(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API}&query=${query}&page=1&include_adult=true`)
                .then(({data}) => {
                    const {results, total_results} = data;
                    let return_data = []
                    if (!total_results) reject({
                        message: `No results found for ${query}`
                    })
                    results.forEach((element) => {
                        if (element.popularity > 20) {

                            return_data.push({
                                adult: element.adult,
                                id: element.id,
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
                                media_type: element.media_type
                            })
                        }
                    })
                    return_data = return_data.sort((a, b) => {
                        return b.popularity - a.popularity
                    })
                    resolve(return_data)
                })
                .catch(err => {
                    console.log(err)
                    reject({message: err.message})
                })
        })
    }
}
exports.torrentDownload = async (query, site) => {
    try {
        let returnData = []
        if (!site) site = 'all'
        await axios.get(`https://torrent-api-d1dee.koyeb.app/api/${site}/${query}`)
            .then(async ({data}) => {
                if (!data) return
                if (Array.isArray(data[0])) {
                    data.forEach((e) => {
                        e.forEach(({DateUploaded, Leechers, Magnet, Name, Seeders, Size, UploadedBy, Category}) => {
                            if (!(/^magnet:\?/i.test(Magnet)) || !parseInt(Seeders) || parseInt(Seeders) < 20 || parseInt(Seeders) > 10000 || parseInt(Seeders) < parseInt(Leechers)) return
                            returnData.push({
                                name: Name,
                                size: Size,
                                age: DateUploaded,
                                seeds: Seeders,
                                magnet: Magnet,
                                provider: UploadedBy,
                                leeches: Leechers,
                                type: Category
                            })
                        })
                    })
                }
                returnData = (returnData.sort((a, b) => {
                    return b.seeds - a.seeds;
                })).slice(0, 50)
            })
            .catch(err => console.log(err.message))
        return returnData
    } catch (err) {
        console.log(err)
    }
}

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