const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
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

  // Handle file downloads with a native save dialog (avoids DBus/XDG issues on Linux)
  mainWindow.webContents.session.on('will-download', (event, item) => {
    const defaultPath = path.join(app.getPath('downloads'), item.getFilename());
    dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    }).then(({ canceled, filePath }) => {
      if (canceled || !filePath) {
        item.cancel();
      } else {
        item.setSavePath(filePath);
      }
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function ensureDatabase() {
  const userDataDb = path.join(app.getPath('userData'), 'biluppgifter.db');
  if (!fs.existsSync(userDataDb)) {
    // In a packaged app, extraResources land in process.resourcesPath
    const bundledDb = app.isPackaged
      ? path.join(process.resourcesPath, 'biluppgifter.db')
      : path.join(__dirname, 'db', 'biluppgifter.db');
    if (fs.existsSync(bundledDb)) {
      fs.mkdirSync(path.dirname(userDataDb), { recursive: true });
      fs.copyFileSync(bundledDb, userDataDb);
      console.log('Database initialised from bundle:', userDataDb);
    } else {
      console.warn('No bundled database found — starting with empty database.');
    }
  }
  return userDataDb;
}

app.whenReady().then(async () => {
  const port = 3737;
  const dbPath = ensureDatabase();

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
