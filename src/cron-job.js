let cron = require('node-cron');
const db = require("./schemas/moviesSchema");
const {torrentDownload, eztv} = require("./puppet");
const axios = require("axios");
const {download} = require("./download")

/**
 * @param bot {Object} Initialized telegram bot
 */
exports.cron = async (bot) => {
    let tv_show
    cron.schedule('0 */6 * * *', async () => {
        console.log('Cron job running...')
        try {
            let toDownload = await db.find({release_date: {$lte: Date.now()}})
            for (let i = 0; i < toDownload.length; i++) {
                const {title, imdbID, type, _id, userID} = toDownload[i];
                if (type === 'movie') {
                    i++
                } else if (type === 'series') {
                    await axios.get('https://api.themoviedb.org/3/find/' + imdbID + '?api_key=' + process.env.tmdb_API + '&language=en-US&external_source=imdb_id')
                        .then(async (res) => {
                            await axios.get('https://api.themoviedb.org/3/tv/' + res.data.tv_results[0].id + '?api_key=' + process.env.tmdb_API + '&language=en-US')
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
                        await bot.sendMessage(userID, `Cron job couldn't find  any result on ${title}`)
                            .catch((err) => console.log(err.message))
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
                        lastEpisodeAired = seasonEpisode(last_episode_to_air.season_number, last_episode_to_air.episode_number)
                        await db.updateOne({_id: _id}, {
                            release_date: first_air_date,
                            complete: true,
                            number_of_seasons: number_of_seasons,
                            provider: networks
                        })
                    } else if (in_production) {
                        if (last_episode_to_air) {
                            lastEpisode = last_episode_to_air.air_date
                            lastEpisodeAired = seasonEpisode(last_episode_to_air.season_number, last_episode_to_air.episode_number)
                        }
                        if (next_episode_to_air) {
                            nextEpisode = next_episode_to_air.air_date
                            nextEpisodeAired = seasonEpisode(next_episode_to_air.season_number, next_episode_to_air.episode_number)
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
    }, {});
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
                    downloadJson = await eztv(`${title}  complete`)
                } else {
                    downloadJson = await eztv(`${title} ${episode.lastEpisode}`)
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
function seasonEpisode(season, episode) {
    if (season < 10) {
        if (episode < 10) {
            return 'S0' + season + 'E0' + episode
        } else {
            return 'S0' + season + 'E' + episode
        }
    } else {
        if (episode < 10) {
            return 'S' + season + 'E0' + episode
        } else {
            return 'S' + season + 'E' + episode
        }
    }
}

