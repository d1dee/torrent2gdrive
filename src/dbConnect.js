const db = require('mongoose')

exports.dbConnect =  async () => {
    await db.connect(process.env.mongo)
        .then(() => {
            console.log('DB connected')
        })
        .catch((error) => {
            console.log('error: ', error.message)
        })
}