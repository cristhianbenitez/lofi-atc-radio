import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

app.get('/proxy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(`http://d.liveatc.net/${id}`, {
      responseType: 'stream'
    });
    
    res.set('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('An error occurred while fetching the stream');
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
