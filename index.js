const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const fastify = require('fastify')();
const fastifyStatic = require('fastify-static');
const ffmpeg = require('ffmpeg-static');
const getPort = require('get-port');
const path = require('path');
const Youtube = require('youtube-api');

const CREDENTIALS = require('./client_id.json');

let oauth = null;
let win;
const state = {};
const timer = {};

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public')
});

fastify.get('/oauth', async (request, reply) => {
  oauth.getToken(request.query.code, (err, tokens) => {
    oauth.setCredentials(tokens);
    reply.redirect('/');
  });
});

fastify.get('/progress', (request, reply) => {
  const { uid } = request.query;
  reply.send(state[uid] || {});
});

function uploadVideo(options) {
  const {
    filepath,
    id,
    title,
    description,
    privacy
  } = options;
  const req = Youtube.videos.insert({
    resource: {
      snippet: {
        title,
        description
      },
      status: {
        privacyStatus: privacy
      }
    },
    part: 'snippet,status',
    media: {
      body: fs.createReadStream(filepath)
    }
  }, (err, data) => {
    state[id] = {
      vid: data.id,
      progress: 100
    };
    clearInterval(timer[id]);
  });
  const fileSize = fs.statSync(filepath).size;
  timer[id] = setInterval(() => {
    const uploadedBytes = req.req.connection._bytesDispatched;
    state[id] = { progress: (uploadedBytes / fileSize) * 100 };
  }, 250);
}

fastify.post('/upload', async (request, reply) => {
  const {
    title,
    files,
  } = request.body;
  const id = ~~(Math.random() * 1000);

  if (!title.length || !files.length) {
    return reply.send({ error: 'No video title / files selected' });
  }
  const options = Object.assign(request.body, { id });
  if (files.length > 1) {
    const filesList = files.map(p => `file '${p.replace(/'/g, '\\\'')}'`).join('\n');
    fs.writeFileSync(`${id}.txt`, filesList);
    const args = `-f concat -safe 0 -i ${id}.txt -c copy ${id}.mp4`.split(' ');
    const proc = spawn(ffmpeg.path, args);
    proc.on('close', () => {
      options.filepath = path.join(__dirname, `${id}.mp4`);
      uploadVideo(options);
    });
  } else {
    const [filepath] = files;
    options.filepath = filepath;
    uploadVideo(options);
  }
  state[id] = { progress: 0 };
  return reply.send({ id, status: 'uploading' });
});

function createWindow() {
  win = new BrowserWindow({ width: 400, height: 600 });
  win.on('closed', () => {
    win = null;
  });
  win.loadURL(oauth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload']
  }));
}

(async () => {
  const port = await getPort({ port: 8080 });
  fastify.listen(port, err => {
    if (err) {
      throw err;
    }

    oauth = Youtube.authenticate({
      type: 'oauth',
      client_id: CREDENTIALS.client_id,
      client_secret: CREDENTIALS.client_secret,
      redirect_url: `http://localhost:${port}/oauth`
    });

    app.on('ready', createWindow);
  });
})();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});
