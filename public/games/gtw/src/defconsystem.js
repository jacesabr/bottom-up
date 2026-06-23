/**
 * DEFCON System for Global Thermonuclear War
 * Manages Defense Readiness Condition levels and escalation logic
 */

class DefconSystem {
    constructor() {
        // Current DEFCON level (5 = peaceful, 1 = nuclear war)
        this.currentLevel = 5;
        
        // DEFCON level definitions
        this.levels = {
            5: {
                level: 5,
                name: 'Exercise Term',
                description: 'Lowest state of readiness',
                color: '#00ff00',
                severity: 'LOW'
            },
            4: {
                level: 4,
                name: 'Increased Watch',
                description: 'Increased intelligence watch and strengthened security measures',
                color: '#00ff00',
                severity: 'LOW'
            },
            3: {
                level: 3,
                name: 'Round House',
                description: 'Increase in force readiness above normal readiness',
                color: '#ffff00',
                severity: 'HIGH'
            },
            2: {
                level: 2,
                name: 'Fast Pace',
                description: 'Next step to nuclear war, armed forces ready to deploy',
                color: '#ff6600',
                severity: 'CRITICAL'
            },
            1: {
                level: 1,
                name: 'Exercise Term',
                description: 'Maximum readiness, nuclear war is imminent',
                color: '#ff0000',
                severity: 'MAXIMUM'
            }
        };
        
        // Escalation triggers and their DEFCON effects
        this.escalationTriggers = {
            'FACTION_ALERT': { target: 4, description: 'Faction placed on alert' },
            'MILITARY_MOVEMENT': { target: 3, description: 'Military forces mobilized' },
            'NUCLEAR_PREPARATION': { target: 2, description: 'Nuclear forces prepared' },
            'IMMINENT_ATTACK': { target: 1, description: 'Nuclear attack imminent' },
            'NUCLEAR_LAUNCH': { target: 1, description: 'Nuclear weapons launched' }
        };
        
        // History tracking
        this.levelHistory = [{
            level: 5,
            timestamp: Date.now(),
            reason: 'INITIALIZATION'
        }];
        
        // Event callbacks
        this.levelChangeCallbacks = [];
    }

    /**
     * Get current DEFCON level
     */
    getCurrentLevel() {
        return this.currentLevel;
    }

    /**
     * Get status description for current level
     */
    getStatusDescription() {
        return this.levels[this.currentLevel].name;
    }

    /**
     * Get status color for current level
     */
    getStatusColor() {
        return this.levels[this.currentLevel].color;
    }

    /**
     * Get full metadata for a DEFCON level
     */
    getLevelMetadata(level) {
        if (level < 1 || level > 5) {
            return null;
        }
        return { ...this.levels[level] };
    }

    /**
     * Set DEFCON level manually
     */
    setLevel(level, reason = 'MANUAL') {
        if (level < 1 || level > 5) {
            console.warn(`Invalid DEFCON level: ${level}`);
            return false;
        }

        const previousLevel = this.currentLevel;
        this.currentLevel = level;

        // Record in history
        this.levelHistory.push({
            level,
            timestamp: Date.now(),
            reason
        });

        // Emit level change event
        const event = {
            from: previousLevel,
            to: level,
            timestamp: Date.now(),
            reason
        };

        this.levelChangeCallbacks.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('Error in DEFCON level change callback:', error);
            }
        });

        console.log(`DEFCON level changed: ${previousLevel} → ${level} (${reason})`);
        return true;
    }

    /**
     * Escalate DEFCON level based on trigger
     */
    escalate(trigger) {
        if (!this.escalationTriggers[trigger]) {
            console.warn(`Unknown escalation trigger: ${trigger}`);
            return false;
        }

        const targetLevel = this.escalationTriggers[trigger].target;
        const description = this.escalationTriggers[trigger].description;

        // Only escalate if target level is lower (more severe) than current
        if (targetLevel < this.currentLevel) {
            return this.setLevel(targetLevel, `ESCALATION: ${trigger}`);
        } else if (targetLevel === this.currentLevel) {
            // Already at this level for this trigger type
            if (this.currentLevel === 1) {
                // Already at maximum alert, cannot escalate further
                console.log(`Already at maximum DEFCON level: ${this.currentLevel}`);
                return false;
            }
            console.log(`Already at DEFCON ${targetLevel} for trigger: ${trigger}`);
            return true;
        } else {
            console.log(`Cannot escalate to higher DEFCON level: ${targetLevel} > ${this.currentLevel}`);
            return false;
        }
    }

    /**
     * Get DEFCON level history
     */
    getLevelHistory() {
        return [...this.levelHistory]; // Return copy to prevent mutation
    }

    /**
     * Get available escalation recommendations
     */
    getEscalationRecommendations() {
        const recommendations = [];
        
        Object.keys(this.escalationTriggers).forEach(trigger => {
            const targetLevel = this.escalationTriggers[trigger].target;
            if (targetLevel < this.currentLevel) {
                recommendations.push(trigger);
            }
        });

        return recommendations;
    }

    /**
     * Register level change callback
     */
    onLevelChange(callback) {
        if (typeof callback === 'function') {
            this.levelChangeCallbacks.push(callback);
        }
    }

    /**
     * Check if level can be escalated
     */
    canEscalate() {
        return this.currentLevel > 1;
    }

    /**
     * Check if level is at maximum alert
     */
    isMaximumAlert() {
        return this.currentLevel === 1;
    }

    /**
     * Get escalation path to target level
     */
    getEscalationPath(targetLevel) {
        if (targetLevel < 1 || targetLevel > 5 || targetLevel >= this.currentLevel) {
            return [];
        }

        const path = [];
        let currentCheck = this.currentLevel;

        Object.entries(this.escalationTriggers).forEach(([trigger, data]) => {
            if (data.target <= targetLevel && data.target < currentCheck) {
                path.push({
                    trigger,
                    description: data.description,
                    targetLevel: data.target
                });
                currentCheck = data.target;
            }
        });

        return path.sort((a, b) => b.targetLevel - a.targetLevel);
    }

    /**
     * Reset DEFCON to peaceful state
     */
    reset() {
        this.setLevel(5, 'RESET');
        console.log('DEFCON system reset to peaceful state');
    }

    /**
     * Get current threat assessment
     */
    getThreatAssessment() {
        const level = this.currentLevel;
        const metadata = this.levels[level];
        
        return {
            level,
            name: metadata.name,
            description: metadata.description,
            severity: metadata.severity,
            color: metadata.color,
            canEscalate: this.canEscalate(),
            isMaximum: this.isMaximumAlert(),
            recommendations: this.getEscalationRecommendations()
        };
    }

    /**
     * Simulate automatic escalation based on game events
     */
    processGameEvent(eventType, eventData) {
        const escalationMap = {
            'FACTION_SELECTED': 'FACTION_ALERT',
            'MILITARY_ACTION': 'MILITARY_MOVEMENT',
            'NUCLEAR_PREPARATION': 'NUCLEAR_PREPARATION',
            'LAUNCH_DETECTED': 'IMMINENT_ATTACK',
            'NUCLEAR_STRIKE': 'NUCLEAR_LAUNCH'
        };

        const trigger = escalationMap[eventType];
        if (trigger) {
            console.log(`Processing game event: ${eventType} → ${trigger}`);
            return this.escalate(trigger);
        }

        return false;
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DefconSystem };
} else if (typeof window !== 'undefined') {
    window.DefconSystem = DefconSystem;
}