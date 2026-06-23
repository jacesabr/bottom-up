/**
 * WOPR Simulation System for Global Thermonuclear War
 * Rapidly simulates thousands of nuclear war scenarios, all ending in DRAW
 */

class WOPRSimulation {
    constructor() {
        // Simulation state
        this.isSimulationRunning = false;
        this.isSimulationComplete = false;
        this.scenarioCount = 0;
        this.targetScenarios = 2000; // Simulate 2000 scenarios for dramatic effect
        this.currentScenario = null;
        
        // Timing configuration for dramatic pacing
        this.simulationSpeed = 'NORMAL';
        this.timingConfig = {
            scenarioInterval: 150,      // ms between scenarios
            visualUpdateInterval: 50,   // ms between visual updates
            pauseBetweenPhases: 1000,   // ms pause between simulation phases
            finalPause: 3000           // ms pause before final message
        };
        
        // Scenario templates for varied simulations
        this.scenarioTemplates = [
            'Global Thermonuclear War',
            'Limited Nuclear Exchange',
            'Escalation to Total War',
            'First Strike Scenario',
            'Retaliatory Strike',
            'DEFCON 1 Crisis',
            'European Theater',
            'Pacific Theater',
            'Submarine Launch',
            'ICBM Exchange',
            'Tactical Nuclear Use',
            'Strategic Command',
            'MAD Scenario',
            'Crisis Escalation',
            'Alert Status Red'
        ];
        
        this.participants = [
            ['United States', 'Soviet Union'],
            ['NATO', 'Warsaw Pact'],
            ['USA', 'USSR'],
            ['Allied Forces', 'Soviet Bloc']
        ];
        
        this.escalationPatterns = ['LIMITED', 'ESCALATED', 'TOTAL'];
        this.firstStrikeOptions = ['US', 'USSR', 'SIMULTANEOUS'];
        
        // Statistics tracking
        this.statistics = {
            scenariosRun: 0,
            drawResults: 0,
            totalSimulationTime: 0,
            averageSimulationTime: 0,
            startTime: null
        };
        
        // Event callbacks
        this.scenarioCompleteCallbacks = [];
        this.visualUpdateCallbacks = [];
        this.simulationCompleteCallbacks = [];
        
        // Simulation intervals
        this.scenarioInterval = null;
        this.visualInterval = null;
        
        console.log('WOPR Simulation System initialized - Ready to analyze nuclear warfare scenarios');
    }

    /**
     * Start the WOPR simulation sequence
     */
    startSimulation() {
        if (this.isSimulationRunning) {
            return;
        }
        
        this.isSimulationRunning = true;
        this.isSimulationComplete = false;
        this.scenarioCount = 0;
        this.statistics.startTime = Date.now();
        
        console.log('WOPR: Beginning simulation of nuclear warfare scenarios...');
        
        // Start scenario generation loop
        this.scenarioInterval = setInterval(() => {
            this.runSingleScenario();
            
            // Check if simulation is complete
            if (this.scenarioCount >= this.targetScenarios) {
                this.completeSimulation();
            }
        }, this.getScenarioInterval());
        
        // Start visual update loop
        this.visualInterval = setInterval(() => {
            this.updateVisuals();
        }, this.timingConfig.visualUpdateInterval);
    }

    /**
     * Run a single nuclear war scenario
     */
    runSingleScenario() {
        const scenarioStartTime = Date.now();
        
        // Generate random scenario
        this.currentScenario = this.generateRandomScenario();
        
        // Simulate the scenario (always results in DRAW)
        this.currentScenario.result = 'DRAW';
        this.currentScenario.simulationTime = Date.now() - scenarioStartTime;
        
        // Update statistics
        this.scenarioCount++;
        this.statistics.scenariosRun++;
        this.statistics.drawResults++;
        this.statistics.totalSimulationTime += this.currentScenario.simulationTime;
        this.statistics.averageSimulationTime = this.statistics.totalSimulationTime / this.statistics.scenariosRun;
        
        // Emit scenario completion event
        this.scenarioCompleteCallbacks.forEach(callback => {
            try {
                callback(this.currentScenario);
            } catch (error) {
                console.error('Error in scenario complete callback:', error);
            }
        });
        
        console.log(`WOPR: Scenario ${this.scenarioCount}: ${this.currentScenario.name} - Result: DRAW`);
    }

    /**
     * Generate a random nuclear war scenario
     */
    generateRandomScenario() {
        const templateIndex = Math.floor(Math.random() * this.scenarioTemplates.length);
        const participantsIndex = Math.floor(Math.random() * this.participants.length);
        const escalationIndex = Math.floor(Math.random() * this.escalationPatterns.length);
        const firstStrikeIndex = Math.floor(Math.random() * this.firstStrikeOptions.length);
        
        const scenario = {
            name: this.scenarioTemplates[templateIndex],
            participants: this.participants[participantsIndex],
            escalationPattern: this.escalationPatterns[escalationIndex],
            firstStrike: this.firstStrikeOptions[firstStrikeIndex],
            duration: Math.floor(Math.random() * 1800) + 300, // 5-30 minutes
            casualtyEstimate: Math.floor(Math.random() * 400000000) + 200000000, // 200M-600M
            outcome: 'DRAW', // All scenarios end in draw
            timestamp: Date.now()
        };
        
        return scenario;
    }

    /**
     * Complete the simulation and trigger final message
     */
    completeSimulation() {
        this.isSimulationRunning = false;
        this.isSimulationComplete = true;
        
        // Clear intervals
        if (this.scenarioInterval) {
            clearInterval(this.scenarioInterval);
            this.scenarioInterval = null;
        }
        if (this.visualInterval) {
            clearInterval(this.visualInterval);
            this.visualInterval = null;
        }
        
        console.log(`WOPR: Simulation complete. ${this.scenarioCount} scenarios analyzed. All results: DRAW`);
        
        // Emit simulation completion event
        setTimeout(() => {
            this.simulationCompleteCallbacks.forEach(callback => {
                try {
                    callback({
                        totalScenarios: this.scenarioCount,
                        allResults: 'DRAW',
                        statistics: this.statistics,
                        conclusion: 'THE_ONLY_WINNING_MOVE_IS_NOT_TO_PLAY'
                    });
                } catch (error) {
                    console.error('Error in simulation complete callback:', error);
                }
            });
        }, this.timingConfig.finalPause);
    }

    /**
     * Update visual elements during simulation
     */
    updateVisuals() {
        const visualState = {
            scenarioCount: this.scenarioCount,
            progress: this.getProgress(),
            currentScenario: this.currentScenario,
            isRunning: this.isSimulationRunning,
            statistics: this.statistics
        };
        
        this.visualUpdateCallbacks.forEach(callback => {
            try {
                callback(visualState);
            } catch (error) {
                console.error('Error in visual update callback:', error);
            }
        });
    }

    /**
     * Stop the simulation
     */
    stopSimulation() {
        this.isSimulationRunning = false;
        
        if (this.scenarioInterval) {
            clearInterval(this.scenarioInterval);
            this.scenarioInterval = null;
        }
        if (this.visualInterval) {
            clearInterval(this.visualInterval);
            this.visualInterval = null;
        }
        
        console.log('WOPR: Simulation stopped');
    }

    /**
     * Reset simulation state
     */
    reset() {
        this.stopSimulation();
        this.isSimulationComplete = false;
        this.scenarioCount = 0;
        this.currentScenario = null;
        this.statistics = {
            scenariosRun: 0,
            drawResults: 0,
            totalSimulationTime: 0,
            averageSimulationTime: 0,
            startTime: null
        };
        
        console.log('WOPR: Simulation reset');
    }

    /**
     * Set simulation speed
     */
    setSimulationSpeed(speed) {
        this.simulationSpeed = speed;
        
        switch (speed) {
            case 'SLOW':
                this.timingConfig.scenarioInterval = 300;
                break;
            case 'NORMAL':
                this.timingConfig.scenarioInterval = 150;
                break;
            case 'FAST':
                this.timingConfig.scenarioInterval = 75;
                break;
            case 'TURBO':
                this.timingConfig.scenarioInterval = 25;
                break;
        }
        
        // Restart interval if simulation is running
        if (this.isSimulationRunning && this.scenarioInterval) {
            clearInterval(this.scenarioInterval);
            this.scenarioInterval = setInterval(() => {
                this.runSingleScenario();
                if (this.scenarioCount >= this.targetScenarios) {
                    this.completeSimulation();
                }
            }, this.getScenarioInterval());
        }
    }

    /**
     * Get current scenario interval based on speed
     */
    getScenarioInterval() {
        return this.timingConfig.scenarioInterval;
    }

    /**
     * Get simulation progress (0-1)
     */
    getProgress() {
        return Math.min(this.scenarioCount / this.targetScenarios, 1);
    }

    /**
     * Get current visual state
     */
    getVisualState() {
        return {
            scenarioCount: this.scenarioCount,
            progress: this.getProgress(),
            currentScenario: this.currentScenario,
            isRunning: this.isSimulationRunning,
            isComplete: this.isSimulationComplete
        };
    }

    /**
     * Get timing configuration
     */
    getTimingConfiguration() {
        return { ...this.timingConfig };
    }

    /**
     * Getters for simulation state
     */
    isRunning() {
        return this.isSimulationRunning;
    }

    isComplete() {
        return this.isSimulationComplete;
    }

    getScenarioCount() {
        return this.scenarioCount;
    }

    getTotalScenariosRun() {
        return this.statistics.scenariosRun;
    }

    getTargetScenarios() {
        return this.targetScenarios;
    }

    getSimulationSpeed() {
        return this.simulationSpeed;
    }

    getStatistics() {
        return { ...this.statistics };
    }

    getCurrentScenario() {
        return this.currentScenario;
    }

    /**
     * Event listener registration
     */
    onScenarioComplete(callback) {
        if (typeof callback === 'function') {
            this.scenarioCompleteCallbacks.push(callback);
        }
    }

    onVisualUpdate(callback) {
        if (typeof callback === 'function') {
            this.visualUpdateCallbacks.push(callback);
        }
    }

    onSimulationComplete(callback) {
        if (typeof callback === 'function') {
            this.simulationCompleteCallbacks.push(callback);
        }
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WOPRSimulation };
} else if (typeof window !== 'undefined') {
    window.WOPRSimulation = WOPRSimulation;
}