const axios = require('axios');
const {TMDB_API} = process.env

exports.movieIndex = async (query) => {
    return new Promise((resolve, reject) => {
        axios.get(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API}&query=${query}&page=1&include_adult=true`)
            .then(({data}) => {
                const {results, total_results} = data;
                let return_data = []
                if (!total_results) reject({
                    err: `No results found for ${query}`
                })
                results.forEach((element) => {
                    if (element.popularity < 20) return null
                    else {
                        return_data.push({
                            adult: element.adult,
                            id:element.id,
                            backdrop_path: element.backdrop_path,
                            genre_ids: element.genre_ids,
                            original_language: element.original_language,
                            original_title: element.original_title || element.original_name,
                            overview: element.overview,
                            popularity: element.popularity,
                            poster_path: element.poster_path,
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
                reject(err.message)
            })
    })

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
                            if (!(/^magnet:\?/i.test(Magnet)) || !parseInt(Seeders) || parseInt(Seeders) < 20 ||
                                parseInt(Seeders) > 10000 || parseInt(Seeders) < parseInt(Leechers)) return
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
        return returnData
    } catch (err) {
        console.log(err)
    }
}