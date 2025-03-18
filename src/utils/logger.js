const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

class Logger {
    constructor(debugMode = false) {
        this.debugMode = debugMode;
    }

    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    debug(message, ...args) {
        if (this.debugMode) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }

    info(message, ...args) {
        console.info(`[INFO] ${message}`, ...args);
    }

    warn(message, ...args) {
        console.warn(`[WARN] ${message}`, ...args);
    }

    error(message, ...args) {
        console.error(`[ERROR] ${message}`, ...args);
    }

    log(level, message, ...args) {
        switch (level) {
            case LOG_LEVELS.DEBUG:
                this.debug(message, ...args);
                break;
            case LOG_LEVELS.INFO:
                this.info(message, ...args);
                break;
            case LOG_LEVELS.WARN:
                this.warn(message, ...args);
                break;
            case LOG_LEVELS.ERROR:
                this.error(message, ...args);
                break;
            default:
                this.info(message, ...args);
        }
    }
}

export const logger = new Logger(process.env.NODE_ENV === 'development');
export { LOG_LEVELS }; 
