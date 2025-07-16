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

    } else if (url.includes('disk.yandex.') || url.includes('disk.360.yandex')) {
      // Yandex Disk
      const apiUrl = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=' + encodeURIComponent(url);
      const { data } = await axios.get(apiUrl);
      if (!data.href) return res.status(400).send('Unable to retrieve download link from Yandex');

      response = await axios.get(data.href, { responseType: 'stream' });

    } else {
      return res.status(400).send('Unsupported URL. Only Google Drive and Yandex Disk are supported.');
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
