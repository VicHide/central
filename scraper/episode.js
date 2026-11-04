const IMAGE_BASE_URL =
    "https://cdni.fancaps.net/file/fancaps-animeimages/"

async function getEpisodeDataset({ episodeTitle, imageIds }, { seriesTitle }) {
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
        throw new Error(`Nenhuma imagem encontrada para ${episodeTitle}.`)
    }

    const imageUrls = imageIds.map(id => {
        return `${IMAGE_BASE_URL}${id}.jpg`
    })

    return {
        seriesTitle,
        episodeTitle,
        imageUrls
    }
}

module.exports = { getEpisodeDataset }