const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

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
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Auto Finder',
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
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

async function ensureDatabase(dbPath) {
  if (fs.existsSync(dbPath)) return;

  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'No Database Found',
    message: 'No database was found. What would you like to do?',
    detail: 'You can import an existing database file or start with an empty database.',
    buttons: ['Import Existing Database', 'Start Fresh'],
    defaultId: 1,
    cancelId: 1,
  });

  if (response === 0) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Database File',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (!canceled && filePaths.length > 0) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.copyFileSync(filePaths[0], dbPath);
    }
  }
}

ipcMain.handle('export-db', async () => {
  const dbPath = path.join(app.getPath('userData'), 'biluppgifter.db');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Database',
    defaultPath: path.join(app.getPath('downloads'), 'biluppgifter.db'),
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  });
  if (canceled || !filePath) return;

  try {
    const { backupDb } = require('./db/sqlite');
    await backupDb(filePath);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Export Complete',
      message: 'Database exported successfully.',
      detail: filePath,
      buttons: ['OK'],
    });
  } catch (err) {
    dialog.showErrorBox('Export Failed', `Could not export database:\n${err.message}`);
  }
});

ipcMain.handle('import-db', async () => {
  const dbPath = path.join(app.getPath('userData'), 'biluppgifter.db');
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Database',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return;

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Confirm Import',
    message: 'Importing will replace the current database. This cannot be undone.',
    buttons: ['Import', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;

  try {
    const { closeDb } = require('./db/sqlite');
    closeDb();
    fs.copyFileSync(filePaths[0], dbPath);
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Import Complete',
      message: 'Database imported successfully.',
      detail: 'The application will now reload.',
      buttons: ['OK'],
    });
    mainWindow.reload();
  } catch (err) {
    dialog.showErrorBox('Import Failed', `Could not import database:\n${err.message}`);
  }
});

app.whenReady().then(async () => {
  const port = 3737;
  const dbPath = path.join(app.getPath('userData'), 'biluppgifter.db');

  await ensureDatabase(dbPath);

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
