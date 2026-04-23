const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const FormData = require('form-data')

const fn = {
  async uploadImage (event, config) {
    const { photo, fileName } = event
    const res = {}
    const imageService = config.IMAGE_CDN
    try {
      if (imageService === 's3') {
        if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
          throw new Error('未配置 S3 图床参数（S3_BUCKET、S3_ACCESS_KEY_ID、S3_SECRET_ACCESS_KEY）')
        }
      } else if (!imageService || !config.IMAGE_CDN_TOKEN) {
        throw new Error('未配置图片上传服务')
      }
      if (config.NSFW_API_URL) {
        const nsfwResult = await fn.checkNsfw({ photo, config })
        if (nsfwResult.rejected) {
          res.code = 'NSFW_REJECTED'
          res.err = nsfwResult.message
          return res
        }
      }
      if (imageService === '7bu') {
        await fn.uploadImageToLskyPro({ photo, fileName, config, res, imageCdn: 'https://7bu.top' })
      } else if (imageService === 'see') {
        await fn.uploadImageToSee({ photo, fileName, config, res, imageCdn: 'https://s.ee/api/v1/file/upload' })
      } else if (fn.isUrl(imageService)) {
        await fn.uploadImageToLskyPro({ photo, fileName, config, res, imageCdn: imageService })
      } else if (imageService === 'lskypro') {
        await fn.uploadImageToLskyPro({ photo, fileName, config, res, imageCdn: config.IMAGE_CDN_URL })
      } else if (imageService === 'piclist') {
        await fn.uploadImageToPicList({ photo, fileName, config, res, imageCdn: config.IMAGE_CDN_URL })
      } else if (imageService === 'easyimage') {
        await fn.uploadImageToEasyImage({ photo, fileName, config, res })
      } else if (imageService === 'chevereto') {
        await fn.uploadImageToChevereto({ photo, fileName, config, res })
      } else if (imageService === 'cfimgbed') {
        await fn.uploadImageToCloudflareImgBed({ photo, fileName, config, res })
      } else if (imageService === 's3') {
        await fn.uploadImageToS3({ photo, fileName, config, res })
      } else {
        throw new Error('不支持的图片上传服务')
      }
    } catch (e) {
      res.code = 'UPLOAD_FAILED'
      res.err = e.message
    }
    return res
  },

  isUrl (string) {
    return string.startsWith('http://') || string.startsWith('https://')
  },

  async uploadImageToCloudflareImgBed ({ photo, fileName, config, res }) {
    if (!config.IMAGE_CDN_URL) {
      throw new Error('未配置 Cloudflare ImgBed 的 API 地址 (IMAGE_CDN_URL)')
    }
    const formData = new FormData()
    formData.append('file', fn.base64UrlToReadStream(photo, fileName))

    let uploadUrl = config.IMAGE_CDN_URL.replace(/\/$/, '')
    const urlObj = new URL(uploadUrl)
    if (!urlObj.searchParams.has('uploadChannel') && config.IMAGE_CDN_TOKEN) {
      try {
        const cfConfig = JSON.parse(config.IMAGE_CDN_TOKEN)
        if (cfConfig.uploadChannel) {
          urlObj.searchParams.append('uploadChannel', cfConfig.uploadChannel)
        }
      } catch (e) {
        // not JSON
      }
    }

    const token = config.IMAGE_CDN_TOKEN || ''

    const response = await axios.post(urlObj.toString(), formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: 'Bearer ' + token
      }
    })

    const data = response.data
    if (data && data[0] && data[0].src) {
      let srcPath = data[0].src
      const cdnUrl = urlObj.origin
      if (srcPath.startsWith('http')) {
        res.data = { url: srcPath, thumb: srcPath, del: '' }
      } else {
        res.data = { url: cdnUrl + srcPath, thumb: cdnUrl + srcPath, del: '' }
      }
    } else {
      throw new Error('Cloudflare ImgBed 上传失败: ' + JSON.stringify(data))
    }
  },

  base64UrlToReadStream (base64Url, fileName) {
    const base64 = base64Url.split(';base64,').pop()
    const writePath = path.resolve(os.tmpdir(), fileName)
    fs.writeFileSync(writePath, base64, { encoding: 'base64' })
    return fs.createReadStream(writePath)
  }
}

module.exports = fn
module.exports.uploadImage = fn.uploadImage