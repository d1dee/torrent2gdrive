const db = require('mongoose')

const moviesSchema = new db.Schema({
    id: String,
    chat_id: String,
    tmdb_id: String,
    title: String,
    type: String,
    release_date: Date,
    number_of_seasons: Number,
    complete: Boolean,
    episode:
        {
            last_episode_date: Date,
            next_episode_date: Date,
            last_episode: String,
            next_episode: String,
        },
    genre: [],
    download:
        {
            file_name: String,
            team_drive_id: String,
            downloaded: Boolean,
            episode: String,
            download_date: Date,
        },
    networks: Array
})

module.exports = db.model('movies', moviesSchema)