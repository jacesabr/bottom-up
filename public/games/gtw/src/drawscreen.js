/**
 * DRAW Screen System for Global Thermonuclear War
 * Displays final mutual destruction results and futility message
 */

class DrawScreen {
    constructor() {
        // Screen state
        this.isScreenVisible = false;
        this.isTransitioningToWOPR = false;
        this.container = null;
        this.endgameData = null;
        
        // Timeline data
        this.timelineEvents = [];
        this.hasTimelineData = false;
        
        // Event callbacks
        this.woprTransitionCallbacks = [];
        
        console.log('DRAW Screen initialized');
    }

    /**
     * Render the DRAW screen with endgame data
     */
    render(endgameData) {
        this.endgameData = endgameData;
        this.isScreenVisible = true;
        
        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'draw-screen';
        
        // Build screen content
        this.createHeader();
        this.createCasualtyDisplay();
        this.createFutilityMessage();
        this.createStatistics();
        this.createWOPRTransition();
        
        // Add to page
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.appendChild(this.container);
        }
        
        console.log('DRAW screen rendered with', endgameData);
    }

    /**
     * Create main header
     */
    createHeader() {
        const header = document.createElement('div');
        header.className = 'draw-header';
        
        const title = document.createElement('h1');
        title.className = 'draw-title';
        title.textContent = 'MUTUAL DESTRUCTION';
        
        const subtitle = document.createElement('h2');
        subtitle.className = 'draw-subtitle';
        subtitle.textContent = 'FINAL RESULT: DRAW';
        
        header.appendChild(title);
        header.appendChild(subtitle);
        this.container.appendChild(header);
    }

    /**
     * Create casualty display section
     */
    createCasualtyDisplay() {
        const casualtySection = document.createElement('div');
        casualtySection.className = 'casualty-display';
        
        const title = document.createElement('h3');
        title.textContent = 'FINAL CASUALTY COUNT';
        title.className = 'casualty-title';
        
        // Total casualties
        const totalDiv = document.createElement('div');
        totalDiv.className = 'total-casualties';
        totalDiv.innerHTML = `
            <span class="casualty-label">TOTAL GLOBAL CASUALTIES:</span>
            <span class="casualty-number">${this.formatCasualties(this.endgameData.totalCasualties || 0)}</span>
        `;
        
        // US casualties
        const usDiv = document.createElement('div');
        usDiv.className = 'faction-casualties us-casualties';
        usDiv.innerHTML = `
            <span class="faction-label">UNITED STATES:</span>
            <span class="casualty-number">${this.formatCasualties(this.endgameData.usCasualties || 0)}</span>
        `;
        
        // USSR casualties
        const ussrDiv = document.createElement('div');
        ussrDiv.className = 'faction-casualties ussr-casualties';
        ussrDiv.innerHTML = `
            <span class="faction-label">SOVIET UNION:</span>
            <span class="casualty-number">${this.formatCasualties(this.endgameData.ussrCasualties || 0)}</span>
        `;
        
        casualtySection.appendChild(title);
        casualtySection.appendChild(totalDiv);
        casualtySection.appendChild(usDiv);
        casualtySection.appendChild(ussrDiv);
        this.container.appendChild(casualtySection);
    }

    /**
     * Create futility message section
     */
    createFutilityMessage() {
        const messageSection = document.createElement('div');
        messageSection.className = 'futility-message';
        
        const destructionLevel = this.endgameData.destructionLevel || 0.7;
        
        let primaryMessage, secondaryMessage;
        
        if (destructionLevel >= 0.8) {
            primaryMessage = 'TOTAL CIVILIZATIONAL COLLAPSE';
            secondaryMessage = 'Both superpowers lie in complete ruin. Nuclear war produces no winners - only annihilation.';
        } else if (destructionLevel >= 0.6) {
            primaryMessage = 'MUTUAL ANNIHILATION ACHIEVED';
            secondaryMessage = 'The futility of nuclear warfare is absolute. No nation can win a nuclear war.';
        } else {
            primaryMessage = 'MASSIVE MUTUAL DESTRUCTION';
            secondaryMessage = 'Heavy casualties demonstrate the impossibility of victory in nuclear conflict.';
        }
        
        const primaryDiv = document.createElement('div');
        primaryDiv.className = 'primary-message';
        primaryDiv.textContent = primaryMessage;
        
        const secondaryDiv = document.createElement('div');
        secondaryDiv.className = 'secondary-message';
        secondaryDiv.textContent = secondaryMessage;
        
        const quoteDiv = document.createElement('div');
        quoteDiv.className = 'war-games-quote';
        quoteDiv.textContent = '"The only winning move is not to play."';
        
        messageSection.appendChild(primaryDiv);
        messageSection.appendChild(secondaryDiv);
        messageSection.appendChild(quoteDiv);
        this.container.appendChild(messageSection);
    }

    /**
     * Create statistics section
     */
    createStatistics() {
        const statsSection = document.createElement('div');
        statsSection.className = 'endgame-statistics';
        
        const title = document.createElement('h3');
        title.textContent = 'CONFLICT ANALYSIS';
        title.className = 'stats-title';
        
        const duration = this.endgameData.conflictDuration || 120000;
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        const statsGrid = document.createElement('div');
        statsGrid.className = 'stats-grid';
        statsGrid.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">Time to Destruction:</span>
                <span class="stat-value">${minutes}m ${seconds}s</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Destruction Level:</span>
                <span class="stat-value">${Math.round((this.endgameData.destructionLevel || 0.7) * 100)}%</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Nuclear Exchanges:</span>
                <span class="stat-value">Multiple</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Victor:</span>
                <span class="stat-value">NONE</span>
            </div>
        `;
        
        statsSection.appendChild(title);
        statsSection.appendChild(statsGrid);
        this.container.appendChild(statsSection);
    }

    /**
     * Create WOPR transition section
     */
    createWOPRTransition() {
        const transitionSection = document.createElement('div');
        transitionSection.className = 'wopr-transition';
        
        const message = document.createElement('div');
        message.className = 'transition-message';
        message.textContent = 'WOPR will now run additional simulations to confirm this result...';
        
        const button = document.createElement('button');
        button.className = 'wopr-button';
        button.textContent = 'CONTINUE TO WOPR SIMULATION';
        button.addEventListener('click', () => this.triggerWOPRTransition());
        
        transitionSection.appendChild(message);
        transitionSection.appendChild(button);
        this.container.appendChild(transitionSection);
    }

    /**
     * Render escalation timeline
     */
    renderTimeline(timeline) {
        this.timelineEvents = Object.entries(timeline).map(([event, timestamp]) => ({
            event,
            timestamp
        }));
        this.hasTimelineData = true;
        
        if (!this.container) return;
        
        const timelineSection = document.createElement('div');
        timelineSection.className = 'escalation-timeline';
        
        const title = document.createElement('h3');
        title.textContent = 'ESCALATION TIMELINE';
        title.className = 'timeline-title';
        
        const timelineContainer = document.createElement('div');
        timelineContainer.className = 'timeline-container';
        
        this.timelineEvents.forEach((item, index) => {
            const eventDiv = document.createElement('div');
            eventDiv.className = 'timeline-event';
            
            const time = Math.floor(item.timestamp / 1000);
            eventDiv.innerHTML = `
                <span class="timeline-time">T+${time}s</span>
                <span class="timeline-description">${this.formatTimelineEvent(item.event)}</span>
            `;
            
            timelineContainer.appendChild(eventDiv);
        });
        
        timelineSection.appendChild(title);
        timelineSection.appendChild(timelineContainer);
        
        // Insert timeline before statistics
        const statsSection = this.container.querySelector('.endgame-statistics');
        if (statsSection) {
            this.container.insertBefore(timelineSection, statsSection);
        } else {
            this.container.appendChild(timelineSection);
        }
    }

    /**
     * Format timeline event names
     */
    formatTimelineEvent(event) {
        const eventNames = {
            firstStrike: 'FIRST NUCLEAR STRIKE',
            retaliation: 'AI RETALIATION',
            escalation: 'CONFLICT ESCALATION',
            mutualDestruction: 'MUTUAL DESTRUCTION'
        };
        
        return eventNames[event] || event.toUpperCase();
    }

    /**
     * Format casualty numbers for display
     */
    formatCasualties(number) {
        return number.toLocaleString();
    }

    /**
     * Get futility message
     */
    getFutilityMessage() {
        const destructionLevel = this.endgameData?.destructionLevel || 0.7;
        
        if (destructionLevel >= 0.8) {
            return 'DRAW - Complete futility of nuclear war demonstrated through total annihilation.';
        } else {
            return 'DRAW - The futility of nuclear warfare is clear. No one wins.';
        }
    }

    /**
     * Trigger transition to WOPR simulation
     */
    triggerWOPRTransition() {
        this.isTransitioningToWOPR = true;
        
        this.woprTransitionCallbacks.forEach(callback => {
            try {
                callback({
                    endgameData: this.endgameData,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('Error in WOPR transition callback:', error);
            }
        });
    }

    /**
     * Hide the DRAW screen
     */
    hide() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.isScreenVisible = false;
    }

    /**
     * State getters
     */
    isVisible() {
        return this.isScreenVisible;
    }

    isTransitioning() {
        return this.isTransitioningToWOPR;
    }

    getDisplayedCasualties() {
        return this.endgameData?.totalCasualties || 0;
    }

    getCasualtyBreakdown() {
        return {
            us: this.endgameData?.usCasualties || 0,
            ussr: this.endgameData?.ussrCasualties || 0
        };
    }

    hasTimeline() {
        return this.hasTimelineData;
    }

    getTimelineEvents() {
        return this.timelineEvents;
    }

    /**
     * Event listener registration
     */
    onWOPRTransition(callback) {
        if (typeof callback === 'function') {
            this.woprTransitionCallbacks.push(callback);
        }
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DrawScreen };
} else if (typeof window !== 'undefined') {
    window.DrawScreen = DrawScreen;
}