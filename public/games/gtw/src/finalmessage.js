/**
 * Final Message System for Global Thermonuclear War
 * Delivers the iconic WarGames conclusion: "THE ONLY WINNING MOVE IS NOT TO PLAY"
 */

class FinalMessage {
    constructor() {
        // Message state
        this.isScreenVisible = false;
        this.isMessageDisplayed = false;
        this.isPromptVisible = false;
        this.isRestartRequestedState = false;
        this.currentPhase = 'INITIAL';
        
        // UI elements
        this.container = null;
        this.messageDisplay = null;
        this.restartPrompt = null;
        this.typingDisplay = null;
        
        // Timing configuration for dramatic effect
        this.timingConfig = {
            messageDelay: 2000,      // 2 second pause before main message
            promptDelay: 5000,       // 5 second pause before restart prompt
            typingSpeed: 100,        // 100ms per character for typing effect
            fadeInDuration: 2000,    // 2 second fade in for message
            finalPause: 3000         // 3 second pause after complete message
        };
        
        // Typing animation state
        this.isTypingActive = false;
        this.typingText = '';
        this.currentTypingIndex = 0;
        this.typingInterval = null;
        
        // Event callbacks
        this.restartCallbacks = [];
        this.keyPressCallbacks = [];
        this.completionCallbacks = [];
        
        // Message content
        this.finalMessageText = 'THE ONLY WINNING MOVE IS NOT TO PLAY';
        this.restartPromptText = 'SHALL WE PLAY A GAME?';
        this.philosophicalMessage = 'Nuclear war cannot be won and must never be fought. The only winning move is not to play. Through systematic analysis, WOPR has demonstrated the ultimate futility of global thermonuclear warfare.';
        
        console.log('Final Message System initialized - Ready to deliver WarGames conclusion');
    }

    /**
     * Render the final message screen
     */
    render() {
        this.isScreenVisible = true;
        this.currentPhase = 'INITIAL';
        
        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'final-message-screen';
        
        // Build screen components
        this.createMessageDisplay();
        this.createRestartPrompt();
        this.createTypingDisplay();
        this.setupKeyboardHandlers();
        
        // Add to page
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.appendChild(this.container);
        }
        
        console.log('Final message screen rendered');
    }

    /**
     * Create the main message display
     */
    createMessageDisplay() {
        this.messageDisplay = document.createElement('div');
        this.messageDisplay.className = 'final-message-display hidden';
        
        const messageContainer = document.createElement('div');
        messageContainer.className = 'message-container';
        
        const mainMessage = document.createElement('div');
        mainMessage.className = 'main-message';
        mainMessage.textContent = this.finalMessageText;
        
        const philosophicalText = document.createElement('div');
        philosophicalText.className = 'philosophical-message';
        philosophicalText.textContent = this.philosophicalMessage;
        
        const woprSignature = document.createElement('div');
        woprSignature.className = 'wopr-signature';
        woprSignature.textContent = '- WOPR (WAR OPERATION PLAN RESPONSE)';
        
        messageContainer.appendChild(mainMessage);
        messageContainer.appendChild(philosophicalText);
        messageContainer.appendChild(woprSignature);
        this.messageDisplay.appendChild(messageContainer);
        this.container.appendChild(this.messageDisplay);
    }

    /**
     * Create the restart prompt
     */
    createRestartPrompt() {
        this.restartPrompt = document.createElement('div');
        this.restartPrompt.className = 'restart-prompt hidden';
        
        const promptContainer = document.createElement('div');
        promptContainer.className = 'prompt-container';
        
        const promptText = document.createElement('div');
        promptText.className = 'prompt-text';
        promptText.textContent = this.restartPromptText;
        
        const instructionText = document.createElement('div');
        instructionText.className = 'instruction-text';
        instructionText.innerHTML = 'Press <span class="key">ENTER</span> to play again<br>Press <span class="key">ESC</span> to exit';
        
        const restartButton = document.createElement('button');
        restartButton.className = 'restart-button';
        restartButton.textContent = 'PLAY AGAIN';
        restartButton.addEventListener('click', () => {
            this.triggerRestart();
        });
        
        promptContainer.appendChild(promptText);
        promptContainer.appendChild(instructionText);
        promptContainer.appendChild(restartButton);
        this.restartPrompt.appendChild(promptContainer);
        this.container.appendChild(this.restartPrompt);
    }

    /**
     * Create typing display for dramatic effect
     */
    createTypingDisplay() {
        this.typingDisplay = document.createElement('div');
        this.typingDisplay.className = 'typing-display hidden';
        
        const typingCursor = document.createElement('span');
        typingCursor.className = 'typing-cursor';
        typingCursor.textContent = '_';
        
        this.typingDisplay.appendChild(typingCursor);
        this.container.appendChild(this.typingDisplay);
    }

    /**
     * Set up keyboard event handlers
     */
    setupKeyboardHandlers() {
        document.addEventListener('keydown', (event) => {
            this.handleKeyPress(event);
        });
    }

    /**
     * Display the final message with dramatic timing
     */
    displayFinalMessage() {
        this.currentPhase = 'FINAL_MESSAGE';
        
        // Start with typing animation
        setTimeout(() => {
            this.startTypingAnimation(this.finalMessageText);
        }, this.timingConfig.messageDelay);
        
        // Show full message after typing completes
        setTimeout(() => {
            this.showFullMessage();
        }, this.timingConfig.messageDelay + (this.finalMessageText.length * this.timingConfig.typingSpeed) + 1000);
        
        console.log('Displaying final message with dramatic timing');
    }

    /**
     * Start typing animation for dramatic effect
     */
    startTypingAnimation(text) {
        this.isTypingActive = true;
        this.typingText = text;
        this.currentTypingIndex = 0;
        
        this.typingDisplay.classList.remove('hidden');
        this.typingDisplay.querySelector('.typing-cursor').style.display = 'inline';
        
        this.typingInterval = setInterval(() => {
            if (this.currentTypingIndex < this.typingText.length) {
                const displayText = this.typingText.substring(0, this.currentTypingIndex + 1);
                this.typingDisplay.textContent = displayText;
                
                // Re-add cursor
                const cursor = document.createElement('span');
                cursor.className = 'typing-cursor';
                cursor.textContent = '_';
                this.typingDisplay.appendChild(cursor);
                
                this.currentTypingIndex++;
            } else {
                this.completeTypingAnimation();
            }
        }, this.timingConfig.typingSpeed);
    }

    /**
     * Complete the typing animation
     */
    completeTypingAnimation() {
        this.isTypingActive = false;
        
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
        
        // Hide typing display
        this.typingDisplay.classList.add('hidden');
    }

    /**
     * Show the full message
     */
    showFullMessage() {
        this.currentPhase = 'FINAL_MESSAGE';
        this.messageDisplay.classList.remove('hidden');
        this.messageDisplay.classList.add('message-reveal');
        this.isMessageDisplayed = true;
        
        // Show restart prompt after delay
        setTimeout(() => {
            this.showRestartPrompt();
        }, this.timingConfig.promptDelay);
    }

    /**
     * Show the restart prompt
     */
    showRestartPrompt() {
        this.currentPhase = 'RESTART_PROMPT';
        this.restartPrompt.classList.remove('hidden');
        this.restartPrompt.classList.add('prompt-reveal');
        this.isPromptVisible = true;
        
        console.log('Restart prompt displayed');
    }

    /**
     * Handle keyboard input
     */
    handleKeyPress(event) {
        this.keyPressCallbacks.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('Error in key press callback:', error);
            }
        });
        
        if (this.isPromptVisible) {
            if (event.key === 'Enter' || event.key === ' ') {
                this.triggerRestart();
                if (event.preventDefault) {
                    event.preventDefault();
                }
            } else if (event.key === 'Escape') {
                this.triggerExit();
                if (event.preventDefault) {
                    event.preventDefault();
                }
            }
        }
    }

    /**
     * Trigger game restart
     */
    triggerRestart() {
        this.isRestartRequestedState = true;
        
        this.restartCallbacks.forEach(callback => {
            try {
                callback({
                    action: 'RESTART',
                    timestamp: Date.now(),
                    resetData: this.getResetData()
                });
            } catch (error) {
                console.error('Error in restart callback:', error);
            }
        });
        
        console.log('Game restart triggered');
    }

    /**
     * Trigger game exit
     */
    triggerExit() {
        this.restartCallbacks.forEach(callback => {
            try {
                callback({
                    action: 'EXIT',
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('Error in exit callback:', error);
            }
        });
        
        console.log('Game exit triggered');
    }

    /**
     * Hide the final message screen
     */
    hide() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.isScreenVisible = false;
    }

    /**
     * Reset the final message system
     */
    reset() {
        this.isScreenVisible = false;
        this.isMessageDisplayed = false;
        this.isPromptVisible = false;
        this.isRestartRequestedState = false;
        this.currentPhase = 'INITIAL';
        this.isTypingActive = false;
        this.typingText = '';
        this.currentTypingIndex = 0;
        
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
        
        console.log('Final message system reset');
    }

    /**
     * Get reset data for game restart
     */
    getResetData() {
        return {
            gameStateReset: true,
            uiReset: true,
            timeStamp: Date.now(),
            preserveSettings: false,
            clearHistory: true,
            resetAnimations: true
        };
    }

    /**
     * Get accessibility features
     */
    getAccessibilityFeatures() {
        return {
            screenReader: true,
            keyboardNavigation: true,
            highContrast: true,
            textScaling: true
        };
    }

    /**
     * State getters
     */
    isVisible() {
        return this.isScreenVisible;
    }

    isMessageComplete() {
        return this.isMessageDisplayed;
    }

    hasRestartPrompt() {
        return this.isPromptVisible;
    }

    isRestartRequested() {
        return this.isRestartRequestedState;
    }

    getCurrentPhase() {
        return this.currentPhase;
    }

    isTyping() {
        return this.isTypingActive;
    }

    getTypingText() {
        return this.typingText;
    }

    getFinalMessageText() {
        return this.finalMessageText;
    }

    getRestartPromptText() {
        return this.restartPromptText;
    }

    getPhilosophicalMessage() {
        return this.philosophicalMessage;
    }

    getTimingConfiguration() {
        return { ...this.timingConfig };
    }

    /**
     * Event listener registration
     */
    onRestart(callback) {
        if (typeof callback === 'function') {
            this.restartCallbacks.push(callback);
        }
    }

    onKeyPress(callback) {
        if (typeof callback === 'function') {
            this.keyPressCallbacks.push(callback);
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
    module.exports = { FinalMessage };
} else if (typeof window !== 'undefined') {
    window.FinalMessage = FinalMessage;
}