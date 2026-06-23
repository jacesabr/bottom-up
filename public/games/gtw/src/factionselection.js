/**
 * Faction Selection Component for Global Thermonuclear War
 * Allows players to choose between UNITED STATES and SOVIET UNION
 */

class FactionSelection {
    constructor() {
        // Screen state
        this.visible = false;
        this.container = null;
        this.selectedFaction = null;
        
        // Available factions
        this.factions = {
            'UNITED STATES': {
                name: 'UNITED STATES',
                displayName: 'UNITED STATES',
                color: '#0066cc',
                flag: '🇺🇸',
                description: 'The United States of America'
            },
            'SOVIET UNION': {
                name: 'SOVIET UNION',
                displayName: 'SOVIET UNION',
                color: '#cc0000',
                flag: '🇷🇺',
                description: 'The Union of Soviet Socialist Republics'
            }
        };
        
        // Event callbacks
        this.factionSelectionCallbacks = [];
        this.stateTransitionCallbacks = [];
        this.factionHoverCallbacks = [];
        
        // Style configuration
        this.styleClasses = ['faction-selection', 'retro-terminal'];
        this.computedStyles = {
            backgroundColor: '#000000',
            color: '#00ff00',
            fontFamily: 'VT323, "Courier New", monospace'
        };
    }

    /**
     * Get available factions
     */
    getAvailableFactions() {
        return Object.keys(this.factions);
    }

    /**
     * Get selected faction
     */
    getSelectedFaction() {
        return this.selectedFaction;
    }

    /**
     * Check if a faction is valid
     */
    isValidFaction(faction) {
        // Explicitly check for falsy values first
        if (!faction || faction === null || faction === undefined) {
            return false;
        }
        
        // Check for string type and non-empty after trimming
        if (typeof faction !== 'string' || faction.trim() === '') {
            return false;
        }
        
        // Check if faction exists in our factions object
        return this.factions.hasOwnProperty(faction);
    }

    /**
     * Get faction information
     */
    getFactionInfo(faction) {
        if (!this.isValidFaction(faction)) {
            return null;
        }
        return { ...this.factions[faction] }; // Return copy to prevent mutation
    }

    /**
     * Select a faction
     */
    selectFaction(faction) {
        if (!this.isValidFaction(faction)) {
            console.warn(`Invalid faction: ${faction}`);
            return false;
        }

        this.selectedFaction = faction;
        console.log(`Faction selected: ${faction}`);

        // Notify faction selection callbacks
        this.factionSelectionCallbacks.forEach(callback => {
            try {
                callback(faction);
            } catch (error) {
                console.error('Error in faction selection callback:', error);
            }
        });

        // Trigger state transition to GAME
        this.stateTransitionCallbacks.forEach(callback => {
            try {
                callback('GAME');
            } catch (error) {
                console.error('Error in state transition callback:', error);
            }
        });

        return true;
    }

    /**
     * Register faction selection callback
     */
    onFactionSelection(callback) {
        if (typeof callback === 'function') {
            this.factionSelectionCallbacks.push(callback);
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
     * Register faction hover callback
     */
    onFactionHover(callback) {
        if (typeof callback === 'function') {
            this.factionHoverCallbacks.push(callback);
        }
    }

    /**
     * Handle faction hover events
     */
    handleFactionHover(faction, isHovering) {
        this.factionHoverCallbacks.forEach(callback => {
            try {
                callback(faction, isHovering);
            } catch (error) {
                console.error('Error in faction hover callback:', error);
            }
        });
    }

    /**
     * Check if screen is visible
     */
    isVisible() {
        return this.visible;
    }

    /**
     * Show the faction selection screen
     */
    show() {
        this.visible = true;
        if (this.screenElement) {
            this.screenElement.style.display = 'block';
        }
        console.log('Faction selection screen shown');
    }

    /**
     * Hide the faction selection screen
     */
    hide() {
        this.visible = false;
        if (this.screenElement) {
            this.screenElement.style.display = 'none';
        }
        console.log('Faction selection screen hidden');
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
     * Render the faction selection screen
     */
    render(container) {
        if (!container) {
            console.error('No container provided for FactionSelection render');
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
        screenContainer.style.textAlign = 'center';

        // Create title section
        const titleSection = document.createElement('div');
        titleSection.className = 'faction-title';
        titleSection.style.marginBottom = '3rem';

        const titleText = document.createElement('div');
        titleText.textContent = 'CHOOSE YOUR SIDE';
        titleText.style.fontSize = '2rem';
        titleText.style.marginBottom = '1rem';
        titleText.style.textShadow = '0 0 15px #00ff00';
        titleText.style.letterSpacing = '0.2rem';

        const subtitleText = document.createElement('div');
        subtitleText.textContent = 'SELECT YOUR FACTION FOR GLOBAL THERMONUCLEAR WAR';
        subtitleText.style.fontSize = '1.2rem';
        subtitleText.style.color = '#00ff00';
        subtitleText.style.textShadow = '0 0 10px #00ff00';

        titleSection.appendChild(titleText);
        titleSection.appendChild(subtitleText);

        // Create factions container
        const factionsContainer = document.createElement('div');
        factionsContainer.className = 'factions-container';
        factionsContainer.style.display = 'flex';
        factionsContainer.style.justifyContent = 'center';
        factionsContainer.style.gap = '4rem';
        factionsContainer.style.marginTop = '3rem';

        // Create faction options
        Object.keys(this.factions).forEach(factionKey => {
            const faction = this.factions[factionKey];
            
            const factionCard = document.createElement('div');
            factionCard.className = 'faction-card';
            factionCard.style.border = '2px solid #00ff00';
            factionCard.style.padding = '2rem';
            factionCard.style.minWidth = '200px';
            factionCard.style.cursor = 'pointer';
            factionCard.style.transition = 'all 0.3s ease';
            factionCard.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';

            // Faction flag/symbol
            const factionFlag = document.createElement('div');
            factionFlag.textContent = faction.flag;
            factionFlag.style.fontSize = '3rem';
            factionFlag.style.marginBottom = '1rem';

            // Faction name
            const factionName = document.createElement('div');
            factionName.textContent = faction.displayName;
            factionName.style.fontSize = '1.5rem';
            factionName.style.fontWeight = 'bold';
            factionName.style.marginBottom = '0.5rem';
            factionName.style.color = faction.color;
            factionName.style.textShadow = `0 0 10px ${faction.color}`;

            // Faction description
            const factionDesc = document.createElement('div');
            factionDesc.textContent = faction.description;
            factionDesc.style.fontSize = '0.9rem';
            factionDesc.style.color = '#00ff00';
            factionDesc.style.opacity = '0.8';

            // Add hover effects
            factionCard.addEventListener('mouseenter', () => {
                factionCard.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
                factionCard.style.borderColor = faction.color;
                factionCard.style.boxShadow = `0 0 20px ${faction.color}`;
                factionCard.style.transform = 'scale(1.05)';
                this.handleFactionHover(factionKey, true);
            });

            factionCard.addEventListener('mouseleave', () => {
                factionCard.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
                factionCard.style.borderColor = '#00ff00';
                factionCard.style.boxShadow = 'none';
                factionCard.style.transform = 'scale(1)';
                this.handleFactionHover(factionKey, false);
            });

            // Add click handler
            factionCard.addEventListener('click', () => {
                // Visual feedback
                factionCard.style.backgroundColor = `rgba(${faction.color === '#0066cc' ? '0, 102, 204' : '204, 0, 0'}, 0.5)`;
                factionCard.style.borderColor = faction.color;
                factionCard.style.boxShadow = `0 0 30px ${faction.color}`;
                
                setTimeout(() => {
                    this.selectFaction(factionKey);
                }, 200);
            });

            factionCard.appendChild(factionFlag);
            factionCard.appendChild(factionName);
            factionCard.appendChild(factionDesc);

            factionsContainer.appendChild(factionCard);
        });

        // Create instructions
        const instructionsSection = document.createElement('div');
        instructionsSection.className = 'instructions';
        instructionsSection.style.marginTop = '3rem';
        instructionsSection.style.fontSize = '1rem';
        instructionsSection.style.color = '#00ff00';
        instructionsSection.style.opacity = '0.8';
        instructionsSection.textContent = 'CLICK TO SELECT YOUR FACTION';

        // Assemble the screen
        screenContainer.appendChild(titleSection);
        screenContainer.appendChild(factionsContainer);
        screenContainer.appendChild(instructionsSection);

        // Add to container
        container.appendChild(screenContainer);

        console.log('FactionSelection rendered');
    }

    /**
     * Destroy the faction selection screen and clean up resources
     */
    destroy() {
        this.hide();
        this.selectedFaction = null;
        
        if (this.container && this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        
        this.container = null;
        
        // Clear callbacks
        this.factionSelectionCallbacks = [];
        this.stateTransitionCallbacks = [];
        this.factionHoverCallbacks = [];
        
        console.log('FactionSelection destroyed');
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FactionSelection };
} else if (typeof window !== 'undefined') {
    window.FactionSelection = FactionSelection;
}