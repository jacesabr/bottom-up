/**
 * Start Screen Component for Global Thermonuclear War
 * Implements the iconic WarGames greeting and game selection
 */

class StartScreen {
    constructor() {
        // Screen state
        this.visible = false;
        this.container = null;
        this.greetingElement = null;
        this.gameListElement = null;
        
        // Configuration
        this.greetingText = 'GREETINGS PROFESSOR FALKEN.';
        this.gameList = [
            'FALKEN\'S MAZE',
            'BLACK JACK',
            'GIN RUMMY',
            'HEARTS',
            'BRIDGE',
            'CHECKERS',
            'CHESS',
            'POKER',
            'FIGHTER COMBAT',
            'GUERRILLA ENGAGEMENT',
            'DESERT WARFARE',
            'AIR-TO-AIR COMBAT',
            'THEATERWIDE TACTICAL WARFARE',
            'THEATERWIDE BIOTOXIC AND CHEMICAL WARFARE',
            'GLOBAL THERMONUCLEAR WAR'
        ];
        
        // Typing animation configuration
        this.typingConfig = {
            speed: 50,  // milliseconds per character
            delay: 1000 // initial delay before typing starts
        };
        
        // Event callbacks
        this.gameSelectionCallbacks = [];
        this.stateTransitionCallbacks = [];
        this.gameHoverCallbacks = [];
        
        // Style configuration
        this.styleClasses = ['start-screen', 'retro-terminal'];
        this.computedStyles = {
            backgroundColor: '#000000',
            color: '#00ff00',
            fontFamily: 'VT323, "Courier New", monospace'
        };
        
        // Current animation state
        this.isAnimating = false;
        this.animationTimeouts = [];
    }

    /**
     * Get the greeting text
     */
    getGreetingText() {
        return this.greetingText;
    }

    /**
     * Get the list of available games
     */
    getGameList() {
        return [...this.gameList]; // Return copy to prevent mutation
    }

    /**
     * Check if a game is available
     */
    isGameAvailable(gameName) {
        return this.gameList.includes(gameName);
    }

    /**
     * Check if screen is visible
     */
    isVisible() {
        return this.visible;
    }

    /**
     * Show the start screen
     */
    show() {
        this.visible = true;
        if (this.screenElement) {
            this.screenElement.style.display = 'block';
            // Start greeting animation when shown
            this.animateGreeting();
        }
        console.log('Start screen shown');
    }

    /**
     * Hide the start screen
     */
    hide() {
        this.visible = false;
        if (this.screenElement) {
            this.screenElement.style.display = 'none';
        }
        this.stopAnimations();
        console.log('Start screen hidden');
    }

    /**
     * Get style classes
     */
    getStyleClasses() {
        return [...this.styleClasses];
    }

    /**
     * Get computed styles
     */
    getComputedStyles() {
        return { ...this.computedStyles };
    }

    /**
     * Get typing animation configuration
     */
    getTypingConfig() {
        return { ...this.typingConfig };
    }

    /**
     * Register game selection callback
     */
    onGameSelection(callback) {
        if (typeof callback === 'function') {
            this.gameSelectionCallbacks.push(callback);
        }
    }

    /**
     * Register state transition callback
     */
    onStateTransition(callback) {
        if (typeof callback === 'function') {
            this.stateTransitionCallbacks.push(callback);
        }
    }

    /**
     * Register game hover callback
     */
    onGameHover(callback) {
        if (typeof callback === 'function') {
            this.gameHoverCallbacks.push(callback);
        }
    }

    /**
     * Select a game
     */
    selectGame(gameName) {
        if (!this.isGameAvailable(gameName)) {
            console.warn(`Game not available: ${gameName}`);
            return false;
        }

        console.log(`Game selected: ${gameName}`);
        
        // Notify game selection callbacks
        this.gameSelectionCallbacks.forEach(callback => {
            try {
                callback(gameName);
            } catch (error) {
                console.error('Error in game selection callback:', error);
            }
        });

        // If Global Thermonuclear War is selected, transition to faction selection
        if (gameName === 'GLOBAL THERMONUCLEAR WAR') {
            this.stateTransitionCallbacks.forEach(callback => {
                try {
                    callback('FACTION_SELECT');
                } catch (error) {
                    console.error('Error in state transition callback:', error);
                }
            });
        }

        return true;
    }

    /**
     * Handle game hover events
     */
    handleGameHover(gameName, isHovering) {
        this.gameHoverCallbacks.forEach(callback => {
            try {
                callback(gameName, isHovering);
            } catch (error) {
                console.error('Error in game hover callback:', error);
            }
        });
    }

    /**
     * Animate the greeting text with typing effect
     */
    animateGreeting() {
        return new Promise((resolve) => {
            if (!this.greetingElement || this.isAnimating) {
                resolve();
                return;
            }

            this.isAnimating = true;
            this.greetingElement.textContent = '';
            
            // Initial delay
            const initialTimeout = setTimeout(() => {
                this.typeText(this.greetingText, 0, resolve);
            }, this.typingConfig.delay);
            
            this.animationTimeouts.push(initialTimeout);
        });
    }

    /**
     * Type text character by character
     */
    typeText(text, index, callback) {
        if (!this.greetingElement || !this.isAnimating) {
            callback();
            return;
        }

        if (index < text.length) {
            this.greetingElement.textContent += text[index];
            
            const timeout = setTimeout(() => {
                this.typeText(text, index + 1, callback);
            }, this.typingConfig.speed);
            
            this.animationTimeouts.push(timeout);
        } else {
            this.isAnimating = false;
            callback();
        }
    }

    /**
     * Stop all animations
     */
    stopAnimations() {
        this.isAnimating = false;
        this.animationTimeouts.forEach(timeout => clearTimeout(timeout));
        this.animationTimeouts = [];
    }

    /**
     * Render the start screen to a container
     */
    render(container) {
        if (!container) {
            console.error('No container provided for StartScreen render');
            return;
        }

        this.container = container;
        
        // Create main container
        const screenContainer = document.createElement('div');
        screenContainer.className = this.styleClasses.join(' ');
        
        // Store reference to the actual screen element for show/hide
        this.screenElement = screenContainer;
        
        // Apply styles
        Object.assign(screenContainer.style, this.computedStyles);
        screenContainer.style.display = this.visible ? 'block' : 'none';
        screenContainer.style.padding = '2rem';
        screenContainer.style.height = '100vh';
        screenContainer.style.overflow = 'auto';

        // Create greeting section
        const greetingSection = document.createElement('div');
        greetingSection.className = 'greeting-section';
        greetingSection.style.marginBottom = '2rem';
        greetingSection.style.textAlign = 'center';

        this.greetingElement = document.createElement('div');
        this.greetingElement.className = 'greeting-text';
        this.greetingElement.style.fontSize = '1.5rem';
        this.greetingElement.style.marginBottom = '1rem';
        this.greetingElement.style.textShadow = '0 0 10px #00ff00';

        greetingSection.appendChild(this.greetingElement);

        // Create game list section
        const gameSection = document.createElement('div');
        gameSection.className = 'game-section';
        gameSection.style.textAlign = 'center';

        const gameListTitle = document.createElement('div');
        gameListTitle.textContent = 'PLEASE CHOOSE A GAME:';
        gameListTitle.style.fontSize = '1.2rem';
        gameListTitle.style.marginBottom = '1rem';
        gameListTitle.style.color = '#00ff00';

        this.gameListElement = document.createElement('div');
        this.gameListElement.className = 'game-list';
        this.gameListElement.style.textAlign = 'left';
        this.gameListElement.style.maxWidth = '400px';
        this.gameListElement.style.margin = '0 auto';

        // Create game list items
        this.gameList.forEach((game, index) => {
            const gameItem = document.createElement('div');
            gameItem.className = 'game-item';
            gameItem.textContent = `${index + 1}. ${game}`;
            gameItem.style.padding = '0.25rem 0.5rem';
            gameItem.style.cursor = 'pointer';
            gameItem.style.transition = 'all 0.2s ease';
            gameItem.style.borderLeft = '3px solid transparent';

            // Add hover effects
            gameItem.addEventListener('mouseenter', () => {
                gameItem.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
                gameItem.style.borderLeft = '3px solid #00ff00';
                gameItem.style.textShadow = '0 0 5px #00ff00';
                this.handleGameHover(game, true);
            });

            gameItem.addEventListener('mouseleave', () => {
                gameItem.style.backgroundColor = 'transparent';
                gameItem.style.borderLeft = '3px solid transparent';
                gameItem.style.textShadow = 'none';
                this.handleGameHover(game, false);
            });

            // Add click handler
            gameItem.addEventListener('click', () => {
                // Highlight selected item
                gameItem.style.backgroundColor = 'rgba(0, 255, 0, 0.4)';
                gameItem.style.textShadow = '0 0 10px #00ff00';
                
                setTimeout(() => {
                    this.selectGame(game);
                }, 100);
            });

            // Highlight Global Thermonuclear War
            if (game === 'GLOBAL THERMONUCLEAR WAR') {
                gameItem.style.color = '#ffff00';
                gameItem.style.fontWeight = 'bold';
            }

            this.gameListElement.appendChild(gameItem);
        });

        gameSection.appendChild(gameListTitle);
        gameSection.appendChild(this.gameListElement);

        // Assemble the screen
        screenContainer.appendChild(greetingSection);
        screenContainer.appendChild(gameSection);

        // Add to container
        container.appendChild(screenContainer);

        console.log('StartScreen rendered');
    }

    /**
     * Destroy the start screen and clean up resources
     */
    destroy() {
        this.stopAnimations();
        this.hide();
        
        if (this.screenElement && this.container) {
            this.container.removeChild(this.screenElement);
        }
        
        this.container = null;
        this.screenElement = null;
        this.greetingElement = null;
        this.gameListElement = null;
        
        // Clear callbacks
        this.gameSelectionCallbacks = [];
        this.stateTransitionCallbacks = [];
        this.gameHoverCallbacks = [];
        
        console.log('StartScreen destroyed');
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StartScreen };
} else if (typeof window !== 'undefined') {
    window.StartScreen = StartScreen;
}