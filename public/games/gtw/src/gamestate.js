/**
 * Game State Management System for Global Thermonuclear War
 * Manages game flow and state transitions
 */

class GameState {
    constructor() {
        // Define valid game states in order
        this.STATES = ['START', 'FACTION_SELECT', 'GAME', 'ENDGAME', 'WOPR', 'FINAL'];
        
        // Define valid state transitions
        this.TRANSITIONS = {
            'START': ['FACTION_SELECT'],
            'FACTION_SELECT': ['GAME'],
            'GAME': ['ENDGAME'],
            'ENDGAME': ['WOPR'],
            'WOPR': ['FINAL'],
            'FINAL': [] // Terminal state
        };
        
        // Initialize state
        this.currentState = 'START';
        this.previousState = null;
        this.stateHistory = [{
            state: 'START',
            timestamp: Date.now()
        }];
        
        // Game data
        this.selectedFaction = null;
        
        // Event listeners for state changes
        this.stateChangeListeners = [];
    }

    /**
     * Get the current game state
     */
    getCurrentState() {
        return this.currentState;
    }

    /**
     * Get the previous game state
     */
    getPreviousState() {
        return this.previousState;
    }

    /**
     * Check if a state name is valid
     */
    isValidState(state) {
        return this.STATES.includes(state);
    }

    /**
     * Check if transition to target state is allowed from current state
     */
    canTransitionTo(targetState) {
        if (!this.isValidState(targetState)) {
            return false;
        }
        
        return this.TRANSITIONS[this.currentState].includes(targetState);
    }

    /**
     * Transition to a new state
     */
    transitionTo(targetState) {
        if (!this.canTransitionTo(targetState)) {
            console.warn(`Invalid state transition from ${this.currentState} to ${targetState}`);
            return false;
        }

        const previousState = this.currentState;
        this.previousState = previousState;
        this.currentState = targetState;
        
        // Add to history
        this.stateHistory.push({
            state: targetState,
            timestamp: Date.now()
        });

        // Emit state change event
        const event = {
            from: previousState,
            to: targetState,
            timestamp: Date.now()
        };

        this.stateChangeListeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Error in state change listener:', error);
            }
        });

        console.log(`State transition: ${previousState} → ${targetState}`);
        return true;
    }

    /**
     * Restart the game (reset to START state)
     */
    restart() {
        this.previousState = null;
        this.currentState = 'START';
        this.selectedFaction = null; // Reset faction selection
        this.stateHistory = [{
            state: 'START',
            timestamp: Date.now()
        }];

        // Emit restart event
        const event = {
            from: null,
            to: 'START',
            timestamp: Date.now(),
            restart: true
        };

        this.stateChangeListeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('Error in state change listener:', error);
            }
        });

        console.log('Game restarted - returned to START state');
        return true;
    }

    /**
     * Add a state change event listener
     */
    onStateChange(callback) {
        if (typeof callback === 'function') {
            this.stateChangeListeners.push(callback);
        }
    }

    /**
     * Remove a state change event listener
     */
    removeStateChangeListener(callback) {
        const index = this.stateChangeListeners.indexOf(callback);
        if (index > -1) {
            this.stateChangeListeners.splice(index, 1);
        }
    }

    /**
     * Get complete state history for debugging
     */
    getStateHistory() {
        return [...this.stateHistory]; // Return copy to prevent mutation
    }

    /**
     * Check if the game is currently in an active gameplay state
     */
    isGameActive() {
        return this.currentState === 'GAME';
    }

    /**
     * Check if we're in the final state
     */
    isFinalState() {
        return this.currentState === 'FINAL';
    }

    /**
     * Set the selected faction
     */
    setSelectedFaction(faction) {
        this.selectedFaction = faction;
        console.log(`Selected faction set: ${faction}`);
    }

    /**
     * Get the selected faction
     */
    getSelectedFaction() {
        return this.selectedFaction;
    }

    /**
     * Get state metadata
     */
    getStateMetadata() {
        return {
            current: this.currentState,
            previous: this.previousState,
            isActive: this.isGameActive(),
            isFinal: this.isFinalState(),
            historyLength: this.stateHistory.length,
            validTransitions: this.TRANSITIONS[this.currentState] || [],
            selectedFaction: this.selectedFaction
        };
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameState };
} else if (typeof window !== 'undefined') {
    window.GameState = GameState;
}