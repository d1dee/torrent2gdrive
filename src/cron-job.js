let cron = require('node-cron');
const db = require("./schemas/moviesSchema");
const {torrentDownload} = require("./puppet");
const axios = require("axios");
const {download} = require("./download")
const fs = require("fs");
const {path} = require("file");

const {TMDB_API} = process.env

/**
 * @param bot {Object} Initialized telegram bot
 */

exports.cron = async (bot) => {
    exports.tmdb_config()
        console.log('Cron job running...')
        try {
            let to_download = await db.find({release_date: {$lte: Date.now()}})
            for (let i = 0; i < to_download.length; i++) {
                const {title, imdbID, type, _id, userID} = to_download[i];
                if (type === 'movie') {
                    i++
                } else if (type === 'series') {
                    const {TMDB_API} = process.env;
                    await axios.get('https://api.themoviedb.org/3/find/' + imdbID + '?api_key=' + TMDB_API + '&language=en-US&external_source=imdb_id')
                        .then(async (res) => {
                            await axios.get('https://api.themoviedb.org/3/tv/' + res.data.tv_results[0].id + '?api_key=' + TMDB_API + '&language=en-US')
                                .then(async (res) => {
                                    tv_show = res.data
                                })
                                .catch((err) => {
                                    console.log('Error', err.message);
                                })
                        })
                        .catch((err) => {
                            console.log('Error', err.message);
                        })
                    if (!tv_show) {
                        console.log('Error', err.message);
                        continue
                    }
                    let nextEpisode, lastEpisode, lastEpisodeAired, nextEpisodeAired
                    const {
                        first_air_date,
                        number_of_seasons,
                        last_episode_to_air,
                        next_episode_to_air,
                        networks,
                        in_production
                    } = tv_show;
                    if (!in_production) {
                        lastEpisode = last_episode_to_air.air_date
                        lastEpisodeAired = exports.seasonEpisode(last_episode_to_air.season_number, last_episode_to_air.episode_number)
                        await db.updateOne({_id: _id}, {
                            release_date: first_air_date,
                            complete: true,
                            number_of_seasons: number_of_seasons,
                            provider: networks
                        })
                    } else if (in_production) {
                        if (last_episode_to_air) {
                            lastEpisode = last_episode_to_air.air_date
                            lastEpisodeAired = exports.seasonEpisode(last_episode_to_air.season_number, last_episode_to_air.episode_number)
                        }
                        if (next_episode_to_air) {
                            nextEpisode = next_episode_to_air.air_date
                            nextEpisodeAired = exports.seasonEpisode(next_episode_to_air.season_number, next_episode_to_air.episode_number)
                        }
                        await db.updateOne({_id: _id}, {
                            release_date: first_air_date, episode: {
                                lastEpisodeDate: lastEpisode,
                                nextEpisodeDate: nextEpisode,
                                lastEpisode: lastEpisodeAired,
                                nextEpisode: nextEpisodeAired
                            }, number_of_seasons: number_of_seasons, provider: networks
                        })
                    }
                }
            }
            cronDownload(bot)
            console.log('now done')
        } catch (err) {
            console.log(err.message)
        }
}

/**
 * @param bot {Object} Telegram bot initialized at index
 * @returns {Promise<void>}
 */
async function cronDownload(bot) {
    try {
        let toDownload = (await db.find({release_date: {$lte: Date.now()}}))
        toDownload.forEach(async (e) => {
            const {complete, download: download1, title, episode, userID, type} = e;
            let _id = e._id.toString()
            if (type === 'movie' && !download1.downloaded) {
                let downloadJson = await torrentDownload(`${title}`)
                for (let i = 0; i < 20; i++) {
                    {
                        if (parseFloat(downloadJson[i].size) < 3 && parseFloat(downloadJson[i].seeds > 50)) {
                            if (!downloadJson[i].magnet) continue
                            else {
                                await download(downloadJson[i].magnet, bot, userID, _id)
                                break
                            }
                        }
                    }
                }
            } else if (type === 'series' && episode.lastEpisode !== download1.episode) {
                let downloadJson
                if (complete) {
                    downloadJson = await torrentDownload(`${title}  complete`, 'eztv')
                } else {
                    downloadJson = await torrentDownload(`${title} ${episode.lastEpisode}`, 'eztv')
                }
                if (!downloadJson) console.log(`Search returned no result for ${title}`)
                for (let i = 0; i < 20; i++) {
                    {
                        if (parseFloat(downloadJson[i].size) < 2 || parseFloat(downloadJson[i].size) > 300 && parseFloat(downloadJson[i].seeds) > 20) {
                            if (!downloadJson[i].magnet) console.log('no magnet link supplied')
                            else {
                                download(downloadJson[i].magnet, bot, userID, _id)
                                break
                            }
                        } else if (complete && parseFloat(downloadJson[i].size) < 15) {
                            download(downloadJson[i].magnet, bot, userID, _id)
                            break
                        }
                    }
                }
            }
        })

    } catch (err) {
        console.log(err.message)
    }
}

/**
 *
 * @param season {Number} Season number
 * @param episode {Number} [undefined] Episode number
 * @returns {string} Returns a combination of Season and Episode number in the format of S02E05
 */
exports.seasonEpisode = (season, episode) => {
    season = season ? season : season = 1
    episode = episode ? episode : episode = 1
    return (season < 10)
        ? ((episode < 10)
            ? 'S0' + season + 'E0' + episode
            : 'S0' + season + 'E' + episode)
        : (episode < 10) ? 'S' + season + 'E0' + episode
            : 'S' + season + 'E' + episode
}

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