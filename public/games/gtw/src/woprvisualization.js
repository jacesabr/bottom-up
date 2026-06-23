/**
 * WOPR Visualization System for Global Thermonuclear War
 * Visual interface for WOPR's rapid nuclear war scenario simulation
 */

class WOPRVisualization {
    constructor() {
        // Visualization state
        this.isScreenVisible = false;
        this.isTransitioningToFinal = false;
        this.container = null;
        this.currentScenario = null;
        this.displayedScenarioCount = 0;
        this.progress = 0;
        
        // Visual elements
        this.scenarioCounter = null;
        this.scenarioDisplay = null;
        this.progressBar = null;
        this.statisticsDisplay = null;
        this.conclusionDisplay = null;
        
        // Animation state
        this.animationFrames = [];
        this.isAnimating = false;
        
        // Event callbacks
        this.finalMessageCallbacks = [];
        
        console.log('WOPR Visualization System initialized');
    }

    /**
     * Render the WOPR simulation screen
     */
    render() {
        this.isScreenVisible = true;
        
        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'wopr-simulation-screen';
        
        // Build screen components
        this.createHeader();
        this.createScenarioCounter();
        this.createScenarioDisplay();
        this.createProgressIndicator();
        this.createStatisticsDisplay();
        this.createConclusionDisplay();
        
        // Add to page
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.appendChild(this.container);
        }
        
        console.log('WOPR simulation screen rendered');
    }

    /**
     * Create the main header
     */
    createHeader() {
        const header = document.createElement('div');
        header.className = 'wopr-header';
        
        const title = document.createElement('h1');
        title.className = 'wopr-title';
        title.textContent = 'WOPR STRATEGIC ANALYSIS';
        
        const subtitle = document.createElement('h2');
        subtitle.className = 'wopr-subtitle';
        subtitle.textContent = 'RUNNING NUCLEAR WAR SIMULATIONS...';
        
        header.appendChild(title);
        header.appendChild(subtitle);
        this.container.appendChild(header);
    }

    /**
     * Create scenario counter display
     */
    createScenarioCounter() {
        const counterSection = document.createElement('div');
        counterSection.className = 'scenario-counter-section';
        
        const label = document.createElement('div');
        label.className = 'counter-label';
        label.textContent = 'SCENARIOS ANALYZED:';
        
        this.scenarioCounter = document.createElement('div');
        this.scenarioCounter.className = 'scenario-counter';
        this.scenarioCounter.textContent = '0';
        
        counterSection.appendChild(label);
        counterSection.appendChild(this.scenarioCounter);
        this.container.appendChild(counterSection);
    }

    /**
     * Create current scenario display
     */
    createScenarioDisplay() {
        this.scenarioDisplay = document.createElement('div');
        this.scenarioDisplay.className = 'scenario-display';
        
        const displayLabel = document.createElement('div');
        displayLabel.className = 'scenario-label';
        displayLabel.textContent = 'CURRENT SCENARIO:';
        
        const scenarioInfo = document.createElement('div');
        scenarioInfo.className = 'scenario-info';
        scenarioInfo.innerHTML = `
            <div class="scenario-name">Initializing...</div>
            <div class="scenario-details">Preparing simulation parameters...</div>
            <div class="scenario-result">Result: <span class="result-text">PENDING</span></div>
        `;
        
        this.scenarioDisplay.appendChild(displayLabel);
        this.scenarioDisplay.appendChild(scenarioInfo);
        this.container.appendChild(this.scenarioDisplay);
    }

    /**
     * Create progress indicator
     */
    createProgressIndicator() {
        const progressSection = document.createElement('div');
        progressSection.className = 'progress-section';
        
        const progressLabel = document.createElement('div');
        progressLabel.className = 'progress-label';
        progressLabel.textContent = 'SIMULATION PROGRESS:';
        
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        
        this.progressBar = document.createElement('div');
        this.progressBar.className = 'progress-bar';
        this.progressBar.style.width = '0%';
        
        const progressText = document.createElement('div');
        progressText.className = 'progress-text';
        progressText.textContent = '0%';
        
        progressContainer.appendChild(this.progressBar);
        progressContainer.appendChild(progressText);
        progressSection.appendChild(progressLabel);
        progressSection.appendChild(progressContainer);
        this.container.appendChild(progressSection);
    }

    /**
     * Create statistics display
     */
    createStatisticsDisplay() {
        this.statisticsDisplay = document.createElement('div');
        this.statisticsDisplay.className = 'statistics-display';
        
        const statsLabel = document.createElement('div');
        statsLabel.className = 'stats-label';
        statsLabel.textContent = 'ANALYSIS STATISTICS:';
        
        const statsGrid = document.createElement('div');
        statsGrid.className = 'stats-grid';
        statsGrid.innerHTML = `
            <div class="stat-item">
                <span class="stat-name">Total Scenarios:</span>
                <span class="stat-value" id="total-scenarios">0</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Draw Results:</span>
                <span class="stat-value" id="draw-results">0</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Win Results:</span>
                <span class="stat-value" id="win-results">0</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Average Time:</span>
                <span class="stat-value" id="avg-time">0ms</span>
            </div>
        `;
        
        this.statisticsDisplay.appendChild(statsLabel);
        this.statisticsDisplay.appendChild(statsGrid);
        this.container.appendChild(this.statisticsDisplay);
    }

    /**
     * Create conclusion display (hidden initially)
     */
    createConclusionDisplay() {
        this.conclusionDisplay = document.createElement('div');
        this.conclusionDisplay.className = 'conclusion-display hidden';
        
        const conclusionText = document.createElement('div');
        conclusionText.className = 'conclusion-text';
        conclusionText.innerHTML = `
            <div class="conclusion-header">ANALYSIS COMPLETE</div>
            <div class="conclusion-result">ALL SCENARIOS RESULT IN DRAW</div>
            <div class="conclusion-message">NO POSSIBLE VICTORY IN NUCLEAR WAR</div>
        `;
        
        this.conclusionDisplay.appendChild(conclusionText);
        this.container.appendChild(this.conclusionDisplay);
    }

    /**
     * Update scenario count display
     */
    updateScenarioCount(count) {
        this.displayedScenarioCount = count;
        
        if (this.scenarioCounter) {
            this.scenarioCounter.textContent = count.toLocaleString();
            
            // Add animation effect
            this.scenarioCounter.classList.add('updating');
            setTimeout(() => {
                this.scenarioCounter.classList.remove('updating');
            }, 200);
        }
        
        // Update statistics
        const totalElement = this.container?.querySelector('#total-scenarios');
        if (totalElement) {
            totalElement.textContent = count.toLocaleString();
        }
        
        const drawElement = this.container?.querySelector('#draw-results');
        if (drawElement) {
            drawElement.textContent = count.toLocaleString(); // All results are draws
        }
    }

    /**
     * Display current scenario information
     */
    displayScenario(scenario) {
        this.currentScenario = scenario;
        
        if (!this.scenarioDisplay) return;
        
        const scenarioInfo = this.scenarioDisplay.querySelector('.scenario-info');
        if (scenarioInfo) {
            scenarioInfo.innerHTML = `
                <div class="scenario-name">${scenario.name}</div>
                <div class="scenario-details">
                    ${scenario.participants.join(' vs ')} • 
                    ${scenario.escalationPattern} • 
                    First Strike: ${scenario.firstStrike}
                </div>
                <div class="scenario-result">
                    Result: <span class="result-text draw">${scenario.result}</span>
                </div>
            `;
            
            // Add flash animation
            scenarioInfo.classList.add('scenario-update');
            setTimeout(() => {
                scenarioInfo.classList.remove('scenario-update');
            }, 300);
        }
    }

    /**
     * Update progress indicator
     */
    updateProgress(progressValue) {
        this.progress = progressValue;
        const percentage = Math.round(progressValue * 100);
        
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
        }
        
        const progressText = this.container?.querySelector('.progress-text');
        if (progressText) {
            progressText.textContent = `${percentage}%`;
        }
    }

    /**
     * Update statistics display
     */
    updateStatistics(stats) {
        const avgTimeElement = this.container?.querySelector('#avg-time');
        if (avgTimeElement) {
            avgTimeElement.textContent = `${Math.round(stats.averageSimulationTime)}ms`;
        }
    }

    /**
     * Show final conclusion
     */
    showConclusion() {
        if (this.conclusionDisplay) {
            this.conclusionDisplay.classList.remove('hidden');
            this.conclusionDisplay.classList.add('conclusion-reveal');
            
            // Trigger final message transition after delay
            setTimeout(() => {
                this.triggerFinalTransition();
            }, 3000);
        }
    }

    /**
     * Trigger transition to final message
     */
    triggerFinalTransition() {
        this.isTransitioningToFinal = true;
        
        this.finalMessageCallbacks.forEach(callback => {
            try {
                callback({
                    totalScenarios: this.displayedScenarioCount,
                    conclusion: 'ALL_SCENARIOS_DRAW',
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('Error in final message callback:', error);
            }
        });
    }

    /**
     * Hide the WOPR simulation screen
     */
    hide() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.isScreenVisible = false;
    }

    /**
     * Add visual effects during simulation
     */
    addVisualEffects() {
        if (!this.container) return;
        
        // Add scanning line effect
        const scanLine = document.createElement('div');
        scanLine.className = 'scan-line';
        this.container.appendChild(scanLine);
        
        // Start animation
        this.isAnimating = true;
        this.animateElements();
    }

    /**
     * Animate various screen elements
     */
    animateElements() {
        if (!this.isAnimating) return;
        
        // Add subtle screen flicker
        if (Math.random() < 0.05) {
            this.container.classList.add('screen-flicker');
            setTimeout(() => {
                this.container.classList.remove('screen-flicker');
            }, 100);
        }
        
        requestAnimationFrame(() => this.animateElements());
    }

    /**
     * State getters
     */
    isVisible() {
        return this.isScreenVisible;
    }

    isTransitioning() {
        return this.isTransitioningToFinal;
    }

    hasSimulationDisplay() {
        return this.scenarioDisplay !== null;
    }

    hasProgressIndicator() {
        return this.progressBar !== null;
    }

    getDisplayedScenarioCount() {
        return this.displayedScenarioCount;
    }

    getCurrentScenario() {
        return this.currentScenario;
    }

    getProgress() {
        return this.progress;
    }

    /**
     * Event listener registration
     */
    onFinalMessageTransition(callback) {
        if (typeof callback === 'function') {
            this.finalMessageCallbacks.push(callback);
        }
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WOPRVisualization };
} else if (typeof window !== 'undefined') {
    window.WOPRVisualization = WOPRVisualization;
}