const db = require('./schemas/moviesSchema')
const {movieIndex} = require("./puppet");

exports.scheduler = (results, bot, chat_id, _id) => {
    return new Promise(async (resolve, reject) => {
        const {
            genres,
            release_date,
            status,
            last_episode_to_air,
            name,
            next_episode_to_air,
            networks,
            number_of_seasons,
            original_name,
            title,
            tmdb_id,
            media_type,
            original_title
        } = await movieIndex(results).catch(err => console.log(err))
        console.log(title)
        let {
            air_date: last_episode_air_date,
            episode_number: last_episode_number,
            season_number: last_episode_season_number
        } = last_episode_to_air ? last_episode_to_air : {}

        let {
            air_date: next_episode_air_date,
            episode_number: next_episode_number,
            name: next_episode_name,
            season_number: next_episode_season_number
        } = next_episode_to_air ? next_episode_to_air : {}
        try {

            (await db.findOne({tmdb_id: tmdb_id, chat_id: chat_id}).catch(err => reject(err)))
                ? !_id
                    ? bot.sendMessage(chat_id, `${title || name} is already scheduled. ${
                        (release_date > Date.now()) ? `Next download will be on ${release_date}`
                            : next_episode_air_date ? `Next download for S${next_episode_season_number} E${next_episode_number} will be on ${next_episode_air_date}`
                                : 'Awaiting announcement for the next release date.'}`)
                        .catch((err) => console.log(err.message))
                    : await db.updateMany({tmdb_id: tmdb_id}, {
                        episode: (media_type === 'tv')
                            ? {
                                last_episode_date: last_episode_air_date,
                                next_episode_date: next_episode_air_date,
                                episode_name: next_episode_name,
                                last_episode: seasonEpisode(last_episode_season_number, last_episode_number),
                                next_episode: seasonEpisode(next_episode_season_number, next_episode_number)
                            } : null,
                        complete: (status === 'Ended')
                    })
                : await db.create({
                    chat_id: chat_id,
                    tmdb_id: tmdb_id,
                    title: title || name || original_title || original_name,
                    number_of_seasons: number_of_seasons,
                    media_type: media_type,
                    complete: (status === 'Ended'),
                    release_date: release_date,
                    episode: (media_type === 'tv') ?
                        {
                            last_episode_date: last_episode_air_date,
                            next_episode_date: next_episode_air_date,
                            episode_name: next_episode_name,
                            last_episode: seasonEpisode(last_episode_season_number, last_episode_number),
                            next_episode: seasonEpisode(next_episode_season_number, next_episode_number),
                        } : undefined,
                    genre: genres,
                    networks: networks
                }).then(() => {
                    bot.sendMessage(chat_id, `${title || name || original_title || original_name} added to schedule`)
                        .catch((err) => console.log(err.message))
                }).catch(err => {
                    reject(err)
                })
            resolve({message: 'success'})
        } catch (err) {
            reject(err)
        }
    })
}
/**
 *
 * @param season {Number} Season number
 * @param episode {Number} [undefined] Episode number
 * @returns {string} Returns a combination of Season and Episode number in the format of S02E05
 */
seasonEpisode = (season, episode) => {
    return !season
        ? null
        : (season < 10)
            ? ((episode < 10)
                ? 'S0' + season + 'E0' + episode
                : 'S0' + season + 'E' + episode)
            : (episode < 10) ? 'S' + season + 'E0' + episode
                : 'S' + season + 'E' + episode
}
