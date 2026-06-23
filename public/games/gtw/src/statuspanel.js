/**
 * Status Panel Component for Global Thermonuclear War
 * Displays faction, DEFCON level, game timer, and other status information
 */

class StatusPanel {
    constructor() {
        // Screen state
        this.visible = true; // Start visible by default
        this.container = null;
        this.panelElement = null; // Reference to the actual panel element
        
        // Status data
        this.statusData = {
            faction: null,
            defcon: 5, // Default peaceful state
            gameTime: '00:00:00',
            aiThreatLevel: 'DEFENSIVE', // AI threat level
            casualties: {
                us: 0,
                ussr: 0
            },
            population: {
                us: 330000000,
                ussr: 290000000
            },
            missiles: {
                us: 0,
                ussr: 0
            }
        };
        
        // Enhanced systems
        this.defconSystem = null;
        this.casualtySystem = null;
        
        // Update callbacks
        this.statusUpdateCallbacks = [];
        
        // Timer state
        this.gameStartTime = null;
        this.timerInterval = null;
        
        // Style configuration
        this.styleClasses = ['status-panel', 'retro-terminal'];
        this.computedStyles = {
            backgroundColor: '#000000',
            color: '#00ff00',
            borderColor: '#00ff00',
            fontFamily: 'VT323, "Courier New", monospace'
        };
    }

    /**
     * Get computed styles
     */
    getComputedStyles() {
        return { ...this.computedStyles };
    }

    /**
     * Set the player's faction
     */
    setFaction(faction) {
        this.statusData.faction = faction;
        this.updateDisplay();
        console.log(`Status panel faction set: ${faction}`);
    }

    /**
     * Get the player's faction
     */
    getFaction() {
        return this.statusData.faction;
    }

    /**
     * Get current status data
     */
    getStatusData() {
        return { ...this.statusData };
    }

    /**
     * Set DEFCON level
     */
    setDefcon(level) {
        if (level >= 1 && level <= 5) {
            this.statusData.defcon = level;
            this.updateDisplay();
            this.emitStatusUpdate();
        }
    }

    /**
     * Set AI threat level
     */
    setAIThreatLevel(threatLevel) {
        this.statusData.aiThreatLevel = threatLevel;
        this.updateDisplay();
        this.emitStatusUpdate();
        console.log(`Status panel AI threat level set: ${threatLevel}`);
    }
    
    /**
     * Set DEFCON system reference
     */
    setDefconSystem(defconSystem) {
        this.defconSystem = defconSystem;
        if (defconSystem) {
            this.setDefcon(defconSystem.getCurrentLevel());
        }
    }
    
    /**
     * Set casualty system reference
     */
    setCasualtySystem(casualtySystem) {
        this.casualtySystem = casualtySystem;
        if (casualtySystem) {
            this.statusData.casualties.us = casualtySystem.getCasualties('us');
            this.statusData.casualties.ussr = casualtySystem.getCasualties('ussr');
            this.updateDisplay();
        }
    }

    /**
     * Get DEFCON level
     */
    getDefcon() {
        return this.statusData.defcon;
    }

    /**
     * Start the game timer
     */
    startTimer() {
        this.gameStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            this.updateGameTime();
        }, 1000);
    }

    /**
     * Stop the game timer
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * Update game time display
     */
    updateGameTime() {
        if (!this.gameStartTime) return;
        
        const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        
        this.statusData.gameTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.updateDisplay();
    }

    /**
     * Check if screen is visible
     */
    isVisible() {
        return this.visible;
    }

    /**
     * Show the status panel
     */
    show() {
        this.visible = true;
        if (this.panelElement) {
            this.panelElement.style.display = 'block';
            console.log('Status panel element made visible');
        } else {
            console.warn('Status panel element not found when trying to show');
        }
        if (this.container) {
            this.container.style.display = 'block';
            console.log('Status panel container made visible');
        } else {
            console.warn('Status panel container not found when trying to show');
        }
        console.log('Status panel shown');
    }

    /**
     * Hide the status panel
     */
    hide() {
        this.visible = false;
        if (this.panelElement) {
            this.panelElement.style.display = 'none';
        }
        if (this.container) {
            this.container.style.display = 'none';
        }
        console.log('Status panel hidden');
    }

    /**
     * Add casualties for a faction
     */
    addCasualties(faction, amount) {
        if (faction === 'us' || faction === 'ussr') {
            this.statusData.casualties[faction] += amount;
            this.updateDisplay();
            this.emitStatusUpdate();
        }
    }
    
    /**
     * Format casualties for display
     */
    formatCasualties(number) {
        if (number >= 1000000) {
            return (number / 1000000).toFixed(1) + 'M';
        } else if (number >= 1000) {
            return (number / 1000).toFixed(number >= 10000 ? 0 : 1) + 'K';
        } else {
            return number.toString();
        }
    }
    
    /**
     * Register status update callback
     */
    onStatusUpdate(callback) {
        if (typeof callback === 'function') {
            this.statusUpdateCallbacks.push(callback);
        }
    }
    
    /**
     * Emit status update event
     */
    emitStatusUpdate() {
        this.statusUpdateCallbacks.forEach(callback => {
            try {
                callback(this.getStatusData());
            } catch (error) {
                console.error('Error in status update callback:', error);
            }
        });
    }
    
    /**
     * Get DEFCON styles
     */
    getDefconStyles() {
        const defconColors = {
            1: '#ff0000', // Red - Maximum readiness
            2: '#ff6600', // Orange - Next step to nuclear war
            3: '#ffff00', // Yellow - Increase in force readiness
            4: '#00ff00', // Green - Increased intelligence watch
            5: '#00ff00'  // Green - Lowest state of readiness
        };
        
        return {
            color: defconColors[this.statusData.defcon] || '#00ff00'
        };
    }

    /**
     * Update the display with current status data
     */
    updateDisplay() {
        if (!this.container) return;

        const factionElement = this.container.querySelector('.faction-display');
        const defconElement = this.container.querySelector('.defcon-display');
        const aiThreatElement = this.container.querySelector('.ai-threat-display');
        const timerElement = this.container.querySelector('.timer-display');
        const casualtiesElement = this.container.querySelector('.casualties-display');

        if (factionElement) {
            factionElement.textContent = this.statusData.faction || 'NO FACTION';
            // Update faction color
            factionElement.style.color = this.statusData.faction === 'UNITED STATES' ? '#0066cc' : this.statusData.faction === 'SOVIET UNION' ? '#cc0000' : '#00ff00';
        }

        if (defconElement) {
            defconElement.textContent = `${this.statusData.defcon}`;
            // Update color based on DEFCON level
            const defconStyles = this.getDefconStyles();
            defconElement.style.color = defconStyles.color;
        }

        if (aiThreatElement) {
            aiThreatElement.textContent = this.statusData.aiThreatLevel;
            // Update color based on threat level
            const threatColors = {
                'DEFENSIVE': '#00ff00',     // Green - low threat
                'RESPONSIVE': '#ffff00',    // Yellow - moderate threat
                'AGGRESSIVE': '#ff6600',    // Orange - high threat
                'ALL_OUT': '#ff0000'        // Red - maximum threat
            };
            aiThreatElement.style.color = threatColors[this.statusData.aiThreatLevel] || '#00ff00';
        }

        if (timerElement) {
            timerElement.textContent = this.statusData.gameTime;
        }
        
        if (casualtiesElement) {
            const usFormatted = this.formatCasualties(this.statusData.casualties.us);
            const ussrFormatted = this.formatCasualties(this.statusData.casualties.ussr);
            casualtiesElement.innerHTML = `US: ${usFormatted} | USSR: ${ussrFormatted}`;
        }
    }

    /**
     * Render the status panel
     */
    render(container) {
        if (!container) {
            console.error('No container provided for StatusPanel render');
            return;
        }

        this.container = container;

        // Create main panel container
        const panelContainer = document.createElement('div');
        panelContainer.className = this.styleClasses.join(' ');
        
        // Apply styles - OPTIMIZED SPACING
        Object.assign(panelContainer.style, this.computedStyles);
        panelContainer.style.display = this.visible ? 'block' : 'none';
        panelContainer.style.padding = '10px'; // Reduced from 15px
        panelContainer.style.border = `2px solid ${this.computedStyles.borderColor}`;
        panelContainer.style.fontSize = '1.1rem'; // Reduced from 1.2rem
        panelContainer.style.height = '100%';  // Fill the container
        panelContainer.style.boxSizing = 'border-box';  // Include padding in height

        // Create title - COMPACT
        const title = document.createElement('div');
        title.className = 'panel-title';
        title.textContent = 'STATUS MONITOR';
        title.style.textAlign = 'center';
        title.style.marginBottom = '8px'; // Reduced from 15px
        title.style.fontSize = '1.2rem'; // Reduced from 1.4rem
        title.style.textShadow = '0 0 10px #00ff00';

        // Create top row: FACTION + TIMER (horizontal layout)
        const topRow = document.createElement('div');
        topRow.className = 'status-row';
        topRow.style.display = 'flex';
        topRow.style.justifyContent = 'space-between';
        topRow.style.marginBottom = '5px';

        const factionBlock = document.createElement('div');
        factionBlock.style.flex = '1';
        factionBlock.style.marginRight = '10px';
        
        const factionLabel = document.createElement('div');
        factionLabel.textContent = 'FACTION:';
        factionLabel.style.fontSize = '0.9rem';
        factionLabel.style.marginBottom = '2px';

        const factionDisplay = document.createElement('div');
        factionDisplay.className = 'faction-display';
        factionDisplay.textContent = this.statusData.faction || 'NO FACTION';
        factionDisplay.style.fontSize = '1.1rem';
        factionDisplay.style.fontWeight = 'bold';
        factionDisplay.style.color = this.statusData.faction === 'UNITED STATES' ? '#0066cc' : this.statusData.faction === 'SOVIET UNION' ? '#cc0000' : '#00ff00';

        factionBlock.appendChild(factionLabel);
        factionBlock.appendChild(factionDisplay);

        const timerBlock = document.createElement('div');
        timerBlock.style.flex = '1';
        
        const timerLabel = document.createElement('div');
        timerLabel.textContent = 'TIME:';
        timerLabel.style.fontSize = '0.9rem';
        timerLabel.style.marginBottom = '2px';

        const timerDisplay = document.createElement('div');
        timerDisplay.className = 'timer-display';
        timerDisplay.textContent = this.statusData.gameTime;
        timerDisplay.style.fontSize = '1.1rem';
        timerDisplay.style.fontWeight = 'bold';
        timerDisplay.style.fontFamily = 'monospace';

        timerBlock.appendChild(timerLabel);
        timerBlock.appendChild(timerDisplay);

        topRow.appendChild(factionBlock);
        topRow.appendChild(timerBlock);

        // Create alert row: DEFCON + AI THREAT (horizontal layout)
        const alertRow = document.createElement('div');
        alertRow.className = 'alert-row';
        alertRow.style.display = 'flex';
        alertRow.style.justifyContent = 'space-between';
        alertRow.style.marginBottom = '5px';

        const defconBlock = document.createElement('div');
        defconBlock.style.flex = '1';
        defconBlock.style.marginRight = '10px';
        
        const defconLabel = document.createElement('div');
        defconLabel.textContent = 'DEFCON:';
        defconLabel.style.fontSize = '0.9rem';
        defconLabel.style.marginBottom = '2px';

        const defconDisplay = document.createElement('div');
        defconDisplay.className = 'defcon-display';
        defconDisplay.textContent = `${this.statusData.defcon}`;
        defconDisplay.style.fontSize = '1.1rem';
        defconDisplay.style.fontWeight = 'bold';

        defconBlock.appendChild(defconLabel);
        defconBlock.appendChild(defconDisplay);

        const aiThreatBlock = document.createElement('div');
        aiThreatBlock.style.flex = '1';
        
        const aiThreatLabel = document.createElement('div');
        aiThreatLabel.textContent = 'AI THREAT:';
        aiThreatLabel.style.fontSize = '0.9rem';
        aiThreatLabel.style.marginBottom = '2px';

        const aiThreatDisplay = document.createElement('div');
        aiThreatDisplay.className = 'ai-threat-display';
        aiThreatDisplay.textContent = this.statusData.aiThreatLevel;
        aiThreatDisplay.style.fontSize = '1.1rem';
        aiThreatDisplay.style.fontWeight = 'bold';
        
        // Color code threat levels
        const threatColors = {
            'DEFENSIVE': '#00ff00',     // Green - low threat
            'RESPONSIVE': '#ffff00',    // Yellow - moderate threat
            'AGGRESSIVE': '#ff6600',    // Orange - high threat
            'ALL_OUT': '#ff0000'        // Red - maximum threat
        };
        aiThreatDisplay.style.color = threatColors[this.statusData.aiThreatLevel] || '#00ff00';

        aiThreatBlock.appendChild(aiThreatLabel);
        aiThreatBlock.appendChild(aiThreatDisplay);

        alertRow.appendChild(defconBlock);
        alertRow.appendChild(aiThreatBlock);

        // Create casualties section - COMPACT
        const casualtiesSection = document.createElement('div');
        casualtiesSection.className = 'casualties-section';
        casualtiesSection.style.marginBottom = '5px';

        const casualtiesLabel = document.createElement('div');
        casualtiesLabel.textContent = 'CASUALTIES:';
        casualtiesLabel.style.fontSize = '0.9rem';
        casualtiesLabel.style.marginBottom = '2px';

        const casualtiesDisplay = document.createElement('div');
        casualtiesDisplay.className = 'casualties-display';
        const usFormatted = this.formatCasualties(this.statusData.casualties.us);
        const ussrFormatted = this.formatCasualties(this.statusData.casualties.ussr);
        casualtiesDisplay.innerHTML = `US: ${usFormatted} | USSR: ${ussrFormatted}`;
        casualtiesDisplay.style.fontSize = '1.0rem';
        casualtiesDisplay.style.fontFamily = 'monospace';
        casualtiesDisplay.style.fontWeight = 'bold';
        casualtiesDisplay.style.lineHeight = '1.2';

        casualtiesSection.appendChild(casualtiesLabel);
        casualtiesSection.appendChild(casualtiesDisplay);

        // Assemble the panel - ULTRA COMPACT LAYOUT
        panelContainer.appendChild(title);
        panelContainer.appendChild(topRow);      // Faction + Timer
        panelContainer.appendChild(alertRow);    // DEFCON + AI Threat
        panelContainer.appendChild(casualtiesSection); // Compact casualties

        // Store reference to the panel element
        this.panelElement = panelContainer;
        
        // Add to container
        container.appendChild(panelContainer);

        console.log('StatusPanel rendered');
        console.log('Panel container display:', panelContainer.style.display);
        console.log('Panel visible state:', this.visible);
        console.log('Panel element:', this.panelElement);
    }

    /**
     * Destroy the status panel and clean up resources
     */
    destroy() {
        this.stopTimer();
        this.hide();
        
        if (this.container && this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        
        this.container = null;
        this.panelElement = null;
        
        console.log('StatusPanel destroyed');
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StatusPanel };
} else if (typeof window !== 'undefined') {
    window.StatusPanel = StatusPanel;
}