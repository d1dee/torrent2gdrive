const db = require('mongoose')

const moviesSchema = new db.Schema({
    id: String,
    userID: String,
    imdbID: {
        type: String,
        unique:true
    },
    title: String,
    type: String,
    release_date: Date,
    number_of_seasons: Number,
    complete: Boolean,
    episode:
        {
            lastEpisodeDate: Date,
            nextEpisodeDate: Date,
            lastEpisode: String,
            nextEpisode: String,
        },
    genre: [],
    download:
        {
            fileName: String,
            teamDriveID: String,
            downloaded: Boolean,
            episode: String,
            downloadDate: Date,
        },
    provider: Array
})

module.exports = db.model('movies', moviesSchema)