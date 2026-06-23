/**
 * Game Reset System for Global Thermonuclear War
 * Handles complete game state reset and system reinitialization
 */

class GameReset {
    constructor() {
        // Reset state
        this.isResetInProgress = false;
        this.isResetCompleted = false;
        this.isUIResetComplete = false;
        
        // Current game state to reset
        this.currentState = {
            gameState: 'START',
            scenarioCount: 0,
            casualties: { us: 0, ussr: 0 },
            defconLevel: 5,
            assetsDestroyed: { us: 0, ussr: 0 },
            missiles: { launched: 0, impacted: 0 },
            timeElapsed: 0,
            faction: null
        };
        
        // Reset configuration
        this.resetConfig = {
            preserveSettings: false,
            clearHistory: true,
            resetAnimations: true,
            reinitializeUI: true,
            clearEventLog: true,
            resetAI: true,
            clearMissiles: true
        };
        
        // Event callbacks
        this.systemResetCallbacks = [];
        this.uiResetCallbacks = [];
        this.completionCallbacks = [];
        
        console.log('Game Reset System initialized');
    }

    /**
     * Reset all game systems
     */
    resetAllSystems() {
        this.isResetInProgress = true;
        
        console.log('Initiating complete game reset...');
        
        // Reset game state
        this.resetGameState();
        
        // Reset UI components
        this.resetUIComponents();
        
        // Reset all subsystems
        this.resetSubsystems();
        
        // Complete reset
        this.completeReset();
        
        console.log('All game systems reset complete');
    }

    /**
     * Reset core game state
     */
    resetGameState() {
        this.currentState = {
            gameState: 'START',
            scenarioCount: 0,
            casualties: { us: 0, ussr: 0 },
            defconLevel: 5,
            assetsDestroyed: { us: 0, ussr: 0 },
            missiles: { launched: 0, impacted: 0 },
            timeElapsed: 0,
            faction: null,
            woprComplete: false,
            endgameTriggered: false
        };
        
        console.log('Game state reset to initial values');
    }

    /**
     * Reset UI components
     */
    resetUIComponents() {
        this.uiResetCallbacks.forEach(callback => {
            try {
                callback({
                    action: 'UI_RESET',
                    timestamp: Date.now(),
                    config: this.resetConfig
                });
            } catch (error) {
                console.error('Error in UI reset callback:', error);
            }
        });
        
        this.isUIResetComplete = true;
        console.log('UI components reset');
    }

    /**
     * Reset all subsystems
     */
    resetSubsystems() {
        this.systemResetCallbacks.forEach(callback => {
            try {
                callback({
                    action: 'SYSTEM_RESET',
                    timestamp: Date.now(),
                    state: this.currentState,
                    config: this.resetConfig
                });
            } catch (error) {
                console.error('Error in system reset callback:', error);
            }
        });
        
        console.log('All subsystems reset');
    }

    /**
     * Complete the reset process
     */
    completeReset() {
        this.isResetInProgress = false;
        this.isResetCompleted = true;
        
        this.completionCallbacks.forEach(callback => {
            try {
                callback({
                    action: 'RESET_COMPLETE',
                    timestamp: Date.now(),
                    validation: this.validateReset()
                });
            } catch (error) {
                console.error('Error in completion callback:', error);
            }
        });
        
        console.log('Game reset process completed');
    }

    /**
     * Set current state before reset
     */
    setCurrentState(state) {
        this.currentState = { ...this.currentState, ...state };
    }

    /**
     * Get current state
     */
    getCurrentState() {
        return { ...this.currentState };
    }

    /**
     * Get restart configuration
     */
    getRestartConfiguration() {
        return { ...this.resetConfig };
    }

    /**
     * Update reset configuration
     */
    updateResetConfiguration(config) {
        this.resetConfig = { ...this.resetConfig, ...config };
    }

    /**
     * Validate reset completion
     */
    validateReset() {
        return {
            allSystemsReset: this.isResetCompleted,
            stateCleared: this.currentState.gameState === 'START',
            uiReset: this.isUIResetComplete,
            scenarioCount: this.currentState.scenarioCount === 0,
            casualties: this.currentState.casualties.us === 0 && this.currentState.casualties.ussr === 0,
            defconLevel: this.currentState.defconLevel === 5,
            ready: this.isResetCompleted && this.isUIResetComplete
        };
    }

    /**
     * Create reset checkpoint
     */
    createResetCheckpoint() {
        return {
            timestamp: Date.now(),
            state: { ...this.currentState },
            config: { ...this.resetConfig },
            validation: this.validateReset()
        };
    }

    /**
     * State getters
     */
    isResetComplete() {
        return this.isResetCompleted;
    }

    isUIReset() {
        return this.isUIResetComplete;
    }

    isInProgress() {
        return this.isResetInProgress;
    }

    /**
     * Event listener registration
     */
    onSystemReset(callback) {
        if (typeof callback === 'function') {
            this.systemResetCallbacks.push(callback);
        }
    }

    onUIReset(callback) {
        if (typeof callback === 'function') {
            this.uiResetCallbacks.push(callback);
        }
    }

    onCompletion(callback) {
        if (typeof callback === 'function') {
            this.completionCallbacks.push(callback);
        }
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameReset };
} else if (typeof window !== 'undefined') {
    window.GameReset = GameReset;
}