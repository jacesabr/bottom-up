/**
 * Screen Management System for Global Thermonuclear War
 * Manages UI screen visibility and transitions
 */

class ScreenManager {
    constructor() {
        // Define valid screens (maps to game states)
        this.SCREENS = ['START', 'FACTION_SELECT', 'GAME', 'ENDGAME', 'WOPR', 'FINAL'];
        
        // Initialize with START screen visible
        this.currentScreen = 'START';
        this.screenElements = new Map();
        
        // Initialize screen elements
        this.initializeScreens();
    }

    /**
     * Initialize screen DOM elements
     */
    initializeScreens() {
        // For now, we'll create placeholder elements for testing
        // In a full implementation, these would be actual DOM elements
        this.SCREENS.forEach(screenName => {
            this.screenElements.set(screenName, {
                name: screenName,
                visible: screenName === 'START',
                element: null // Will be actual DOM element in full implementation
            });
        });
    }

    /**
     * Get the currently visible screen
     */
    getCurrentScreen() {
        return this.currentScreen;
    }

    /**
     * Check if a specific screen is currently visible
     */
    isScreenVisible(screenName) {
        const screen = this.screenElements.get(screenName);
        return screen ? screen.visible : false;
    }

    /**
     * Show a specific screen (hide all others)
     */
    showScreen(screenName) {
        if (!this.isValidScreen(screenName)) {
            console.warn(`Invalid screen name: ${screenName}`);
            return false;
        }

        // Hide all screens
        this.screenElements.forEach(screen => {
            screen.visible = false;
        });

        // Show target screen
        const targetScreen = this.screenElements.get(screenName);
        targetScreen.visible = true;
        this.currentScreen = screenName;

        console.log(`Screen changed to: ${screenName}`);
        return true;
    }

    /**
     * Check if screen name is valid
     */
    isValidScreen(screenName) {
        return this.SCREENS.includes(screenName);
    }

    /**
     * Hide all screens
     */
    hideAllScreens() {
        this.screenElements.forEach(screen => {
            screen.visible = false;
        });
        this.currentScreen = null;
    }

    /**
     * Get screen visibility status for all screens
     */
    getScreenStatus() {
        const status = {};
        this.screenElements.forEach((screen, name) => {
            status[name] = screen.visible;
        });
        return status;
    }

    /**
     * Connect to DOM elements (for full implementation)
     */
    connectToDOM(appElement) {
        // This method would connect to actual DOM elements
        // For now, we'll just log the connection
        console.log('ScreenManager connected to DOM element:', appElement);
        return true;
    }

    /**
     * Create screen transition effects
     */
    transitionToScreen(screenName, effect = 'fade') {
        if (!this.showScreen(screenName)) {
            return false;
        }

        console.log(`Screen transition to ${screenName} with ${effect} effect`);
        return true;
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScreenManager };
} else if (typeof window !== 'undefined') {
    window.ScreenManager = ScreenManager;
}