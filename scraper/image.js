const path = require("path")
const fs = require("fs")

async function downloadImage(axios, { imageUrl, title }, { saveDir }) {
    const fileName = path.basename(new URL(imageUrl).pathname)
    const episodeDir = path.resolve(saveDir, title)
    const filePath = path.join(episodeDir, fileName)

    fs.mkdirSync(episodeDir, { recursive: true })

    // Não baixa novamente arquivos que já existem.
    if (fs.existsSync(filePath)) {
        return { status: "skipped", filePath }
    }

    const response = await axios(imageUrl, {
        responseType: "arraybuffer"
    })

    // Grava primeiro em um arquivo temporário.
    const tempPath = `${filePath}.part`

    try {
        fs.writeFileSync(tempPath, response.data)
        fs.renameSync(tempPath, filePath)
    } catch (error) {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath)
        }

        throw error
    }

    return { status: "downloaded", filePath }
}

function getImageId(imageUrl) {
    return new URL(imageUrl).pathname.match(/\d+/)
}

module.exports = { downloadImage, getImageId }