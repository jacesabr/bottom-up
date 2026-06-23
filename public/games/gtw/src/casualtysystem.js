/**
 * Casualty System for Global Thermonuclear War
 * Tracks and manages casualties for both factions
 */

class CasualtySystem {
    constructor() {
        // Casualty counters for each faction
        this.casualties = {
            us: 0,
            ussr: 0
        };
        
        // Casualty event history
        this.casualtyEvents = [];
        
        // Event callbacks
        this.casualtyEventCallbacks = [];
        
        // Faction metadata
        this.factionData = {
            us: {
                name: 'United States',
                color: '#0066cc',
                population: 330000000
            },
            ussr: {
                name: 'Soviet Union',
                color: '#cc0000',
                population: 290000000
            }
        };
    }

    /**
     * Get casualties for a specific faction
     */
    getCasualties(faction) {
        if (!this.isValidFaction(faction)) {
            return 0;
        }
        return this.casualties[faction];
    }

    /**
     * Get total casualties across all factions
     */
    getTotalCasualties() {
        return this.casualties.us + this.casualties.ussr;
    }

    /**
     * Add casualties for a faction
     */
    addCasualties(faction, amount) {
        if (!this.isValidFaction(faction)) {
            console.warn(`Invalid faction: ${faction}`);
            return false;
        }

        if (typeof amount !== 'number' || amount < 0) {
            console.warn(`Invalid casualty amount: ${amount}`);
            return false;
        }

        this.casualties[faction] += amount;

        // Record casualty event
        const event = {
            faction,
            casualties: amount,
            total: this.casualties[faction],
            timestamp: Date.now()
        };

        this.casualtyEvents.push(event);

        // Emit casualty event
        this.casualtyEventCallbacks.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('Error in casualty event callback:', error);
            }
        });

        console.log(`Casualties added: ${faction} +${this.formatNumber(amount)} (Total: ${this.formatNumber(this.casualties[faction])})`);
        return true;
    }

    /**
     * Set casualties for a faction (absolute value)
     */
    setCasualties(faction, amount) {
        if (!this.isValidFaction(faction)) {
            console.warn(`Invalid faction: ${faction}`);
            return false;
        }

        if (typeof amount !== 'number' || amount < 0) {
            console.warn(`Invalid casualty amount: ${amount}`);
            return false;
        }

        const previousTotal = this.casualties[faction];
        this.casualties[faction] = amount;

        // Record casualty event if there was a change
        if (amount !== previousTotal) {
            const event = {
                faction,
                casualties: amount - previousTotal,
                total: amount,
                timestamp: Date.now()
            };

            this.casualtyEvents.push(event);

            // Emit casualty event
            this.casualtyEventCallbacks.forEach(callback => {
                try {
                    callback(event);
                } catch (error) {
                    console.error('Error in casualty event callback:', error);
                }
            });
        }

        return true;
    }

    /**
     * Get comprehensive casualty statistics
     */
    getStatistics() {
        const usTotal = this.casualties.us;
        const ussrTotal = this.casualties.ussr;
        const combinedTotal = usTotal + ussrTotal;

        return {
            us: {
                total: usTotal,
                percentage: combinedTotal > 0 ? (usTotal / combinedTotal) * 100 : 0,
                populationPercentage: (usTotal / this.factionData.us.population) * 100
            },
            ussr: {
                total: ussrTotal,
                percentage: combinedTotal > 0 ? (ussrTotal / combinedTotal) * 100 : 0,
                populationPercentage: (ussrTotal / this.factionData.ussr.population) * 100
            },
            combined: {
                total: combinedTotal,
                usPercentage: combinedTotal > 0 ? (usTotal / combinedTotal) * 100 : 0,
                ussrPercentage: combinedTotal > 0 ? (ussrTotal / combinedTotal) * 100 : 0
            }
        };
    }

    /**
     * Get casualty events history
     */
    getCasualtyEvents() {
        return [...this.casualtyEvents]; // Return copy to prevent mutation
    }

    /**
     * Register casualty event callback
     */
    onCasualtyEvent(callback) {
        if (typeof callback === 'function') {
            this.casualtyEventCallbacks.push(callback);
        }
    }

    /**
     * Reset all casualty counters
     */
    reset() {
        this.casualties.us = 0;
        this.casualties.ussr = 0;
        this.casualtyEvents = [];
        console.log('Casualty system reset');
    }

    /**
     * Check if faction is valid
     */
    isValidFaction(faction) {
        return faction === 'us' || faction === 'ussr';
    }

    /**
     * Format number for display (e.g., 1500000 → "1.5M")
     */
    formatNumber(number) {
        if (number >= 1000000) {
            return (number / 1000000).toFixed(1) + 'M';
        } else if (number >= 1000) {
            return (number / 1000).toFixed(number >= 10000 ? 0 : 1) + 'K';
        } else {
            return number.toString();
        }
    }

    /**
     * Get faction metadata
     */
    getFactionData(faction) {
        if (!this.isValidFaction(faction)) {
            return null;
        }
        return { ...this.factionData[faction] };
    }

    /**
     * Calculate casualty rate per minute
     */
    getCasualtyRate(timeWindowMinutes = 5) {
        const cutoffTime = Date.now() - (timeWindowMinutes * 60 * 1000);
        const recentEvents = this.casualtyEvents.filter(event => event.timestamp >= cutoffTime);
        
        const totalRecentCasualties = recentEvents.reduce((sum, event) => sum + event.casualties, 0);
        return Math.round(totalRecentCasualties / timeWindowMinutes);
    }

    /**
     * Get casualties by faction breakdown
     */
    getCasualtyBreakdown() {
        return {
            us: {
                casualties: this.casualties.us,
                formatted: this.formatNumber(this.casualties.us),
                color: this.factionData.us.color,
                name: this.factionData.us.name
            },
            ussr: {
                casualties: this.casualties.ussr,
                formatted: this.formatNumber(this.casualties.ussr),
                color: this.factionData.ussr.color,
                name: this.factionData.ussr.name
            },
            total: {
                casualties: this.getTotalCasualties(),
                formatted: this.formatNumber(this.getTotalCasualties())
            }
        };
    }

    /**
     * Simulate casualty event from strike
     */
    processStrike(faction, targetType, yield_kt) {
        // Simplified casualty calculation based on nuclear yield
        let baseCasualties = 0;
        
        switch (targetType) {
            case 'CITY':
                baseCasualties = yield_kt * 5000; // 5000 casualties per kiloton in city
                break;
            case 'MILITARY_BASE':
                baseCasualties = yield_kt * 1000; // 1000 casualties per kiloton at military base
                break;
            case 'INDUSTRIAL':
                baseCasualties = yield_kt * 2500; // 2500 casualties per kiloton at industrial target
                break;
            default:
                baseCasualties = yield_kt * 1500; // Default casualty rate
        }

        // Add some randomness (±25%)
        const variation = 0.25;
        const casualties = Math.round(baseCasualties * (1 + (Math.random() - 0.5) * variation));

        return this.addCasualties(faction, casualties);
    }

    /**
     * Get severity assessment based on casualties
     */
    getSeverityAssessment() {
        const totalCasualties = this.getTotalCasualties();
        
        if (totalCasualties === 0) {
            return { level: 'NONE', description: 'No casualties reported', color: '#00ff00' };
        } else if (totalCasualties < 100000) {
            return { level: 'LIMITED', description: 'Limited casualties', color: '#ffff00' };
        } else if (totalCasualties < 1000000) {
            return { level: 'MODERATE', description: 'Moderate casualties', color: '#ff6600' };
        } else if (totalCasualties < 10000000) {
            return { level: 'SEVERE', description: 'Severe casualties', color: '#ff0000' };
        } else {
            return { level: 'CATASTROPHIC', description: 'Catastrophic casualties', color: '#ff0000' };
        }
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CasualtySystem };
} else if (typeof window !== 'undefined') {
    window.CasualtySystem = CasualtySystem;
}