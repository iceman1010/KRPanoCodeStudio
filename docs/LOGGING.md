# Logging System

## Overview

The KRPanoCodeStudio application includes a comprehensive logging system that captures application events, errors, and debugging information to help diagnose issues.

## Log File Location

The log file is stored in the application's user data directory:

**Linux:** `~/.config/krpanocode-studio/studio.log`  
**macOS:** `~/Library/Application Support/krpanocode-studio/studio.log`  
**Windows:** `%APPDATA%\krpanocode-studio\studio.log`

## How It Works

The logging system is implemented in `main/index.cjs` (lines 9-31):

1. **Initialization**: `initLogger()` is called during app startup (line 674)
2. **File Writing**: Creates a write stream to the log file with overwrite mode
3. **Console Interception**: Overrides `console.log` and `console.error` to simultaneously output to both console and log file
4. **Timestamping**: Each log entry includes `[INFO]` or `[ERROR]` prefix with ISO timestamp
5. **Automatic Cleanup**: Log streams are properly closed on app quit

## Log Entry Format

```
[TIMESTAMP] [LOG_LEVEL] [MODULE] Message
```

Example:
```
[INFO]  2026-08-01T11:41:53.769Z [backend] bundled PHP not found, using system PHP at /usr/bin/php
[ERROR] 2026-08-01T11:41:54.378Z [spawn] error: PHAR exited with code 1
```

## Common Log Modules

- `[app]` - Application lifecycle events (startup, shutdown)
- `[backend]` - Backend configuration (PHP/PHAR setup)
- `[spawn]` - PHAR process spawning and execution
- `[phar]` - PHAR file management
- `[watcher]` - File system watcher events
- `[update]` - Auto-update process

## Viewing Logs

### Via Electron App
The application provides an IPC handler to open logs:
- Call `ipcRenderer.invoke("open_log")` to open log file in system file manager
- Call `ipcRenderer.invoke("get_log_path")` to get the log file path

### Direct Access
Navigate directly to the log file location based on your operating system.

### Command Line
```bash
# View recent logs
tail -f ~/.config/krpanocode-studio/studio.log

# Search for errors
grep ERROR ~/.config/krpanocode-studio/studio.log

# Filter by module
grep "\[spawn\]" ~/.config/krpanocode-studio/studio.log
```

## Disabling Logging

If you need to disable logging for development or troubleshooting:

### Method 1: Comment Out Initialization
In `main/index.cjs`, comment out line 674:
```javascript
// initLogger();
```

### Method 2: Conditional Initialization
Modify the `initLogger()` function to check for an environment variable:
```javascript
function initLogger() {
  if (process.env.KRPANOCODE_NO_LOG === "1") return;
  // existing initialization code...
}
```

Then run the app with:
```bash
KRPANOCODE_NO_LOG=1 npm run dev
```

### Method 3: Modify Log Level
Create a modified version that only logs errors:
```javascript
console.log = (...args) => {
  origLog(...args); // Only console output
  // Skip file logging for info messages
};
console.error = (...args) => {
  origErr(...args);
  if (logStream) logStream.write(`[ERROR] ${new Date().toISOString()} ${args.map(String).join(" ")}\n`);
};
```

## Troubleshooting Common Issues

### "PHAR exited with code 1"
This error indicates the PHAR process failed but no stderr was captured. Common causes:

1. **Missing PHAR file**: Check if `krpanocode.phar` exists in the user data directory
2. **PHP compatibility**: Verify PHP version meets requirements (PHP 8.0+)
3. **Missing dependencies**: Ensure PHP has required extensions
4. **Permission issues**: Check file permissions for PHAR and tour directories

Check logs for:
- Backend configuration errors
- Spawn command details
- Working directory path
- Any stderr output

### No Log File Created
If the log file doesn't exist:

1. Check application has write permissions to user data directory
2. Verify `app.getPath("userData")` returns expected path
3. Check if `initLogger()` is being called during startup

### Log File Too Large
The log file is overwritten on each app start (`flags: "w"`). If you need to retain logs:

1. Change to append mode:
```javascript
logStream = fs.createWriteStream(logPath, { flags: "a" });
```

2. Implement log rotation:
```javascript
const logPath = path.join(app.getPath("userData"), `studio-${Date.now()}.log`);
```

## Development Tips

### Adding Custom Logging
Use the already-intercepted console methods:
```javascript
console.log("[my_module] Some info message");
console.error("[my_module] Some error message");
```

### Debug Mode
Combine logging with Electron DevTools for complete debugging:
```javascript
if (isDev) {
  mainWindow.webContents.openDevTools();
}
```

### Remote Debugging
For production issues, consider adding remote error reporting alongside local logging.

## Performance Considerations

- Synchronous file writes could impact performance; current implementation uses streams
- High-frequency logging may benefit from buffering or rate limiting
- Consider log file size limits for long-running applications