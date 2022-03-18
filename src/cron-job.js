const db = require("./schemas/moviesSchema");
const {torrentDownload} = require("./puppet");
const axios = require("axios");
const {download} = require("./download")
const fs = require("fs");
const {path} = require("file");
const {scheduler} = require("./schedule");
const log = require('loglevel');
const {setAuth} = require("./upload");

const {TMDB_API} = process.env

/**
 * @param bot {Object} Initialized telegram bot
 */

exports.cron_job = async (bot) => {
    exports.tmdb_config()
    trackers()
    setAuth()
    log.info('Cron job running...')
    try {
        let to_download = await db.find({release_date: {$lte: Date.now()}})
        let scheduler_promise = []

        to_download.forEach((element) => {
            const {tmdb_id, media_type, chat_id, _id, episode: {next_episode_date}, complete} = element
            if (media_type === 'movie') {
                scheduler_promise.push(scheduler({tmdb_id, media_type}, bot, chat_id, _id)
                    .catch((err) => {
                        log.error(err)
                    }))
            } else if (media_type === 'tv') {
                (!complete && next_episode_date)
                    ? (Date.parse(next_episode_date) <= Date.now())
                        ? scheduler_promise.push(scheduler({tmdb_id, media_type}, bot, chat_id, _id)
                            .catch((err) => {
                                log.error(err)
                            }))
                        : null
                    : null
            }
        })
        Promise.all(scheduler_promise)
            .then(_ => {
                    log.info("DB Promise resolved successfully")
                    cron_download(bot)
                }
            )
            .catch(err => log.error(err))
    } catch (err) {
        log.error(err)
    }
}

/**
 * @param bot {Object} Telegram bot initialized at index
 * @returns {Promise<void>}
 */
async function cron_download(bot) {
    try {
        let to_download = await db.find({release_date: {$lte: Date.now()}})
            .catch(err => log.warn(err))

        to_download.forEach(async (element) => {
            const {
                episode: {last_episode, last_episode_date}, release_date,
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
                                        : log.warn(`No result found matching ${title}`)
                                    : null
                        });
                        element ? download(element.magnet, bot, chat_id, _id) : log.warn(`No result found matching ${title}`)
                    })
                    .catch(err=> log.error(err))

            } else if (media_type === 'tv') {

                (episode !== last_episode)
                    ? await torrentDownload(`${title} ${
                        ((Date.parse(release_date) === Date.parse(last_episode_date) && last_episode !== "S01E01")
                            ? 'complete'
                            : last_episode)}`)
                        .then((response) => {
                            const element = response.find(element => {
                                return element
                                    ? (/(web(\W|\s|)rip)|(hd(\W|\s|)tv)/gi).test(element.name)
                                        ? element.name.match((new RegExp(title.replace(/(\W|\s)/ig, '(\\W|\\s|).?'), 'ig')))
                                            ? (Number.parseFloat(element.size) > 300 || Number.parseFloat(element.size) < 2 && element.seeds > 50)
                                            : log.warn(`No result found matching ${title}`)
                                        : null
                                    : null
                            })
                            element ? download(element.magnet, bot, chat_id, _id) : log.warn(`No result found matching ${title}`)

                        })
                        .catch(err=> log.error(err))

                    : log.warn(`Already downloaded ${title}`)
            }
        })
    } catch (err) {
        log.error(err)
    }
}

/**
 * This function gets tmdb configs which are need for categories when using multi search.
 * Returned JSON includes base url for all pictures and picture qualities
 * @returns {Promise<void>}
 */
exports.tmdb_config = async () => {
    let tmdb_file = []
    let axios_promise = [axios.get(`https://api.themoviedb.org/3/configuration?api_key=${TMDB_API}`).catch(err=>log.error(err.message)),
        axios.get(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API}`).catch(err=>log.error(err.message))]

    await Promise.all(axios_promise)
        .then((results) => {
            results.forEach((element) => {
                const {data} = element
                tmdb_file.push(data)
            })
        })
        .catch(err => log.error(err.message))
    await fs.writeFileSync(path.join(__dirname, 'tmdb.json'), JSON.stringify(tmdb_file))

}

function trackers() {
    try {
        axios.get('https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all_ip.txt')
            .then(async ({data}) => {

                data = (data.toString().replace(/(\s)|('\\n')|\+/gm, '\'')).split('\'\'')
                data.pop()
                await fs.writeFileSync(path.join(__dirname, 'trackers.json'), JSON.stringify(data))
            })
            .catch(err=> log.error(err.message))
    } catch (err) {
        log.error(err)
    }
}