const db = require("./schemas/moviesSchema");
const {torrentDownload} = require("./puppet");
const axios = require("axios");
const {download} = require("./download")
const fs = require("fs");
const {path} = require("file");
const {scheduler} = require("./schedule");

const {TMDB_API} = process.env

/**
 * @param bot {Object} Initialized telegram bot
 */

exports.cron_job = async (bot) => {
    exports.tmdb_config()
    console.log('Cron job running...')
    try {
        let to_download = await db.find({release_date: {$lte: Date.now()}})
        let scheduler_promise = []

        to_download.forEach((element) => {
            const {tmdb_id, media_type, chat_id, _id} = element
            if (media_type !== 'movie')
                scheduler_promise.push(scheduler({tmdb_id, media_type}, bot, chat_id, _id)
                    .catch((err) => {
                        console.log(err)
                    }))
        })
        Promise.all(scheduler_promise)
            .then(_ => {
                    console.log("DB Promise resolved successfully")
                    cron_download(bot)
                }
            )
            .catch(err => console.log(err))
    } catch (err) {
        console.log(err.message)
    }
}

/**
 * @param bot {Object} Telegram bot initialized at index
 * @returns {Promise<void>}
 */
async function cron_download(bot) {
    try {
        let to_download = await db.find({release_date: {$lte: Date.now()}})

        to_download.forEach(async (element) => {
            const {
                episode: {next_episode_date, next_episode, episode_name, last_episode},
                _id, chat_id, title, media_type, download: {downloaded, episode}
            } = element;

            if (media_type === 'movie' && !downloaded) {
                torrentDownload(title)
                    .then(response => {
                        const element = response.find(element => {
                            return (/(CAM(\s|\W|)Rip)|(CAM)|(HD(\s|\W|)CAM)|(HD(\s|\W|)TS)/ig).test(element.name)
                                ? null
                                : (/(WEB(\W|\s|)Rip )|(WEB(\s|\W)DL)|(Blu(\W|\s|)Ray)/gi).test(element.name)
                                    ? element.name.match((new RegExp(title.replace(/(\W|\s)/ig, '(\\W|\\s|).?'), 'ig')))
                                        ? (Number.parseFloat(element.size) < 3 && element.seeds > 50)
                                        : console.log(`No result found matching ${title}`)
                                    : null
                        });
                        element ? download(element.magnet, bot, chat_id, _id) : console.log(`No result found matching ${title}`)
                    })

            } else if (media_type === 'tv') {
                (!downloaded && episode !== last_episode)
                    ? await torrentDownload(`${title} ${last_episode}`)
                        .then((response) => {
                            const element = response.find(element => {
                                return element
                                    ? (/(web(\W|\s|)rip)|(hd(\W|\s|)tv)/gi).test(element.name)
                                        ? element.name.match((new RegExp(title.replace(/(\W|\s)/ig, '(\\W|\\s|).?'), 'ig')))
                                            ? (Number.parseFloat(element.size) > 500 || Number.parseFloat(element.size) < 2 && element.seeds > 50)
                                            : console.log(`No result found matching ${title}`)
                                        : null
                                    : null
                            })
                            element ? download(element.magnet, bot, chat_id, _id) : console.log(`No result found matching ${title}`)

                        })
                    : console.log(`Already downloaded ${title}`)
            }
        })
    } catch (err) {
        console.log(err)
    }
}

/**
 * This function gets tmdb configs which are need for categories when using multi search.
 * Returned JSON includes base url for all pictures and picture qualities
 * @returns {Promise<void>}
 */
exports.tmdb_config = async () => {
    let tmdb_file = []
    let axios_promise = [axios.get(`https://api.themoviedb.org/3/configuration?api_key=${TMDB_API}`),
        axios.get(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API}`)]

    await Promise.all(axios_promise)
        .then((results) => {
            results.forEach((element) => {
                const {data} = element
                tmdb_file.push(data)
            })
        })
        .catch(err => console.log(err.message))
    await fs.writeFileSync(path.join(__dirname, 'tmdb.json'), JSON.stringify(tmdb_file))

}