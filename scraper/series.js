const fs = require("fs")
const path = require("path")

async function getSeriesData(seriesUrl) {
    const dataPath = path.join(__dirname, "anime_data.json")

    if (!fs.existsSync(dataPath)) {
        throw new Error("Arquivo anime_data.json não encontrado.")
    }

    const url = new URL(seriesUrl)
    const match = url.search.slice(1).match(/^(\d+)-/)

    if (!match) {
        throw new Error("Não foi possível identificar o ID do anime na URL.")
    }

    const animeId = Number(match[1])
    const animeData = JSON.parse(fs.readFileSync(dataPath, "utf-8"))

    const anime = animeData.find(item => item.id === animeId)

    if (!anime) {
        throw new Error(`Anime com ID ${animeId} não encontrado no JSON.`)
    }

    const episodes = anime.episodes.map(episode => {
        let imageIds

        if (Array.isArray(episode.valid_images_ids)) {
            imageIds = episode.valid_images_ids
        } else {
            imageIds = Array.from(
                {
                    length: episode.last_image_id - episode.first_image_id + 1
                },
                (_, i) => episode.first_image_id + i
            )
        }

        return {
            episodeTitle: `Episode ${episode.episode}`,
            episodeId: episode.id,
            imageIds
        }
    })

    return {
        seriesTitle: anime.title,
        episodes
    }
}

module.exports = { getSeriesData }