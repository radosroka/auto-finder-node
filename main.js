const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');

let mainWindow;
let expressServer;

function startExpressServer(port, dbPath) {
  process.env.APP_PORT = String(port);
  process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex');
  process.env.DB_PATH = dbPath;

  const expressApp = require('./app');
  return new Promise((resolve, reject) => {
    expressServer = expressApp.listen(port, '127.0.0.1', () => {
      console.log(`Express server running on http://127.0.0.1:${port}`);
      resolve();
    });
    expressServer.on('error', reject);
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Auto Finder',
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.webContents.openDevTools();

  // External links open in the system browser; internal links stay in the app
  const internalBase = `http://127.0.0.1:${port}`;

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(internalBase)) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(internalBase)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const port = 3737;
  const dbPath = path.join(app.getPath('userData'), 'biluppgifter.db');

  try {
    await startExpressServer(port, dbPath);
    createWindow(port);
  } catch (err) {
    console.error('Failed to start server:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(port);
    }
  });
});

app.on('window-all-closed', () => {
  if (expressServer) expressServer.close();
  if (process.platform !== 'darwin') app.quit();
});
