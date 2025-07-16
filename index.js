const express = require('express');
const axios = require('axios');
const app = express();

app.get('/', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing "url" parameter');

  try {
    let response;

    if (url.includes('drive.google.com')) {
      // Google Drive
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) return res.status(400).send('Invalid Google Drive URL');
      const fileId = match[1];
      const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

      response = await axios.get(directUrl, { responseType: 'stream' });

    } else if (url.includes('disk.yandex.') || url.includes('disk.360.yandex.')) {
      // Yandex Disk public
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      let downloadLink;

      if (segments[0] === 'd' && segments[1] && segments.length > 2) {
        // Shared folder + file: /d/<folderId>/<fileName>
        const folderUrl = `${parsed.origin}/d/${segments[1]}`;
        const fileName = segments.slice(2).join('/');
        // Get metadata for the specific file
        const metaUrl = `https://cloud-api.yandex.net/v1/disk/public/resources` +
          `?public_key=${encodeURIComponent(folderUrl)}` +
          `&path=/${fileName}`;
        const { data: meta } = await axios.get(metaUrl);
        if (!meta.file) throw new Error('Unable to get file metadata from Yandex');
        downloadLink = meta.file;
      } else {
        // Direct file link: /i/<id>
        const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl);
        if (!data.href) throw new Error('Unable to get download link from Yandex');
        downloadLink = data.href;
      }

      // Fetch and stream the file
      response = await axios.get(downloadLink, { responseType: 'stream' });

    } else {
      // Other URLs: fetch directly
      response = await axios.get(url, { responseType: 'stream' });
    }

    // Отправляем поток с CORS-заголовками
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');

    response.data.pipe(res);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).send('Failed to fetch image');
  }
});

const PORT = process.env.PORT || 2920;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
