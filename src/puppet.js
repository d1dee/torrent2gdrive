const axios = require('axios');
const tableToJson = require('tabletojson').Tabletojson
const {OMDB_API} = process.env


/*
const uAgent = {
    0: 'Opera/9.80 (X11; Linux i686; Ubuntu/14.10) Presto/2.12.388 Version/12.16.2',
    1: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.77 Safari/537.36',
    2: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2919.83 Safari/537.36',
    3: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2866.71 Safari/537.36',
    4: 'Mozilla/5.0 (X11; Ubuntu; Linux i686 on x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2820.59 Safari/53',
    5: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19582',
    6: 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:77.0) Gecko/20100101 Firefox/77.0',
    7: 'Mozilla/5.0 (X11; Linux ppc64le; rv:75.0) Gecko/20100101 Firefox/75.0',
    8: 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:39.0) Gecko/20100101 Firefox/75.0',
    9: 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10.10; rv:75.0) Gecko/20100101 Firefox/75.0'
}
*/


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
exports.torrentDownload = async (query) => {
    try {
        let remap = []
        await tableToJson.convertUrl('https://www.1377x.to/sort-search/' + encodeURI(query.toLowerCase()) + '/seeders/desc/1/',
            {stripHtmlFromCells: false}, (tablesAsJson) => {
            tablesAsJson = tablesAsJson[0]
            if (tablesAsJson === undefined) {
                console.log('No results found on 1337X')
                return undefined
            } else {
                for (let i = 0; i < tablesAsJson.length; i++) {
                    const {se, time, uploader, name, le} = tablesAsJson[i];
                    remap.push({
                        name: (((name).match(/\/">.*</gmi)).toString()).replace(/[/"><]/igm, ''),
                        magnet: 'https://www.1377x.to' + (((name).match(/\/torrent.*"/gmi)).toString()).replace(/["]/igm, ''),
                        seeds: se,
                        leeches: le,
                        age: time,
                        size: tablesAsJson[i]['size info'],
                        provider: (((uploader).match(/>.*</igm)).toString()).replace(/[><]/igm, '')
                    })
                }
            }
        });
        return remap
    } catch (err) {
        console.log(err)
    }
}

/**
 *
 * @param query {String} The episode to search
 * @returns {Promise<*[result]>} Return an array with results of each episode object
 */
exports.eztv = async (query) => {
    let result = []
    console.log(query)
    await tableToJson.convertUrl(`https://eztv.re/search/${query.replaceAll(' ', '-')}`,
        {stripHtmlFromCells: false}, (res) => {
            res[3].forEach((e) => {
                if (!e[2] || !e[2].match(/magnet:\?/)) return
                let
                    magnet = (e[2].match(/"magnet:.*?"/)).toString().replace(/"/g,''),
                    seeds = (e[5].match(/(\d.*\w.*?\d)|(\d+)/g))
                if (!seeds || !magnet) return
                result.push({
                    name: (e[1].match(/title=".*?"/)).toString().replace(/"|title=/g, ''),
                    size: e[3],
                    age: e[4],
                    seeds: seeds,
                    magnet: magnet,
                    provider: 'eZtv',
                    leeches: undefined
                })

            })

        })
   return result
}

/*
exports.torrentDownload = async (query) => {
    try {

        function randomString() {
            for (var r = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP1234567890', t = '', e = 0; e < 8; e++) {
                let a = Math.floor(Math.random() * r.length);
                t += r.charAt(a)
            }
            return t
        }


        let url_code = ((await axios.get(`https://snowfl.com/b.min.js?v=wyZqoQwOZmpkiXyaiuURzeGTRAwTpajrQ4${randomString()}`, {headers: {'User-Agent': uAgent[(Math.random() * 10).toFixed(0)]}})).data).toString()

        url_code = ((url_code.match(/]}};var.*";\$\(/gm)).toString().match(/".*"/gm)).toString().replace(/"+/g, '')

        console.log(query)

        let returnJson = ((await axios.get(`https://snowfl.com/${url_code}/${encodeURI(query)}/${randomString()}/0/SEED/NONE/1?_=`,{headers: {'User-Agent': uAgent[(Math.random() * 10).toFixed(0)]}})).data)
        returnJson.push({url_code})
        return returnJson
    } catch (err) {
        console.log(err.message)
    }

}
*/
/*


exports.eztv = async (query) => {
}
*/


