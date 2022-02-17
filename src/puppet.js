const axios = require('axios');
const {OMDB_API} = process.env

exports.movieIndex = async (query) => {
    try {
        if (/^tt/gmi.test(query) === true) {
            return await axios.get('http://www.omdbapi.com/?i=' + encodeURI(query) + '&plot=full&apikey=' + OMDB_API);
        } else if (/[0-9]{4}/gmi.test(query) === true) {
            let year = query.match(/[0-9]{4}/gmi).toString()
            query = query.toString().replace(year, '').trimEnd()
            console.log(year, query)
            return await axios.get('http://www.omdbapi.com/?s=' + encodeURI(query) + '&y=' + year + '&apikey=' + OMDB_API);
        } else {
            return await axios.get('http://www.omdbapi.com/?s=' + encodeURI(query) + '&apikey=' + OMDB_API);
        }
    } catch (e) {
        console.log(e, '\n /****************** OMDB Error***********************/');
    }
}
exports.torrentDownload = async (query, site) => {
    try {
        let returnData = []
        if(!site) site = 'all'
        await axios.get(`https://torrent-api-d1dee.koyeb.app/api/${site}/${query}`)
            .then(async ({data}) => {
                if (!data) return
                if (Array.isArray(data[0])) {
                    data.forEach((e) => {
                        e.forEach(({DateUploaded, Leechers, Magnet, Name, Seeders, Size, UploadedBy, Type}) => {
                            if (!(/^magnet:\?/i.test(Magnet)) || !parseInt(Seeders) || parseInt(Seeders) < parseInt(Leechers)) return
                            returnData.push({
                                name: Name,
                                size: Size,
                                age: DateUploaded,
                                seeds: Seeders,
                                magnet: Magnet,
                                provider: UploadedBy,
                                leeches: Leechers,
                                type: Type,
                            })
                        })
                    })
                }
                returnData = (returnData.sort((a, b) => {
                    return b.Seeders - a.Seeders;
                })).slice(0,50)
            })
        return returnData
    } catch (err) {
        console.log(err)
    }
}