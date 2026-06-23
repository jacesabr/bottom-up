/**
 * Event Log Component for Global Thermonuclear War
 * Displays chronological log of game events with timestamps
 */

class EventLog {
    constructor(options = {}) {
        // Configuration
        this.maxEvents = options.maxEvents || 100;
        this.autoScroll = options.autoScroll !== false;
        
        // Screen state
        this.visible = false;
        this.container = null;
        this.logContainer = null;
        
        // Event data
        this.events = [];
        
        // Style configuration
        this.styleClasses = ['event-log', 'retro-terminal'];
        this.computedStyles = {
            backgroundColor: '#000000',
            color: '#00ff00',
            borderColor: '#00ff00',
            fontFamily: 'VT323, "Courier New", monospace'
        };
        
        // Event type styles
        this.eventTypeStyles = {
            system: { color: '#00ff00' },
            user: { color: '#00ffff' },
            warning: { color: '#ffff00' },
            error: { color: '#ff0000' },
            info: { color: '#ffffff' }
        };
    }

    /**
     * Add an event to the log
     */
    addEvent(message, type = 'info') {
        const event = {
            message,
            type,
            timestamp: Date.now(),
            formattedTime: this.formatTimestamp(Date.now())
        };
        
        this.events.push(event);
        
        // Maintain event limit
        if (this.events.length > this.maxEvents) {
            this.events.shift(); // Remove oldest event
        }
        
        this.updateDisplay();
        
        if (this.autoScroll) {
            this.scrollToBottom();
        }
        
        console.log(`Event logged: [${type}] ${message}`);
    }

    /**
     * Get all events
     */
    getEvents() {
        return [...this.events]; // Return copy to prevent mutation
    }

    /**
     * Clear all events
     */
    clear() {
        this.events = [];
        this.updateDisplay();
        console.log('Event log cleared');
    }

    /**
     * Format timestamp for display
     */
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Check if auto-scroll should be enabled
     */
    shouldAutoScroll() {
        return this.autoScroll;
    }

    /**
     * Scroll to bottom of log
     */
    scrollToBottom() {
        if (this.logContainer) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    /**
     * Check if screen is visible
     */
    isVisible() {
        return this.visible;
    }

    /**
     * Show the event log
     */
    show() {
        this.visible = true;
        if (this.container) {
            this.container.style.display = 'block';
        }
        console.log('Event log shown');
    }

    /**
     * Hide the event log
     */
    hide() {
        this.visible = false;
        if (this.container) {
            this.container.style.display = 'none';
        }
        console.log('Event log hidden');
    }

    /**
     * Update the display with current events
     */
    updateDisplay() {
        if (!this.logContainer) return;

        // Clear existing content
        this.logContainer.innerHTML = '';

        // Add each event
        this.events.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = `log-entry log-entry-${event.type}`;
            
            // Apply event type styling
            const typeStyle = this.eventTypeStyles[event.type] || this.eventTypeStyles.info;
            Object.assign(eventElement.style, {
                color: typeStyle.color,
                marginBottom: '5px',
                fontSize: '0.9rem',
                fontFamily: 'monospace'
            });

            // Create timestamp
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'timestamp';
            timestampSpan.textContent = `[${event.formattedTime}] `;
            timestampSpan.style.color = '#666666';

            // Create message
            const messageSpan = document.createElement('span');
            messageSpan.className = 'message';
            messageSpan.textContent = event.message;

            eventElement.appendChild(timestampSpan);
            eventElement.appendChild(messageSpan);

            this.logContainer.appendChild(eventElement);
        });

        // Auto-scroll to bottom if enabled
        if (this.shouldAutoScroll()) {
            setTimeout(() => this.scrollToBottom(), 10);
        }
    }

    /**
     * Render the event log
     */
    render(container) {
        if (!container) {
            console.error('No container provided for EventLog render');
            return;
        }

        this.container = container;

        // Create main log container
        const logPanel = document.createElement('div');
        logPanel.className = this.styleClasses.join(' ');
        
        // Apply styles
        Object.assign(logPanel.style, this.computedStyles);
        logPanel.style.display = this.visible ? 'block' : 'none';
        logPanel.style.padding = '15px';
        logPanel.style.border = `2px solid ${this.computedStyles.borderColor}`;
        logPanel.style.height = '100%';
        logPanel.style.maxHeight = '100%'; // Respect container height limits
        logPanel.style.display = 'flex';
        logPanel.style.flexDirection = 'column';
        logPanel.style.boxSizing = 'border-box'; // Include padding/border in height calculation

        // Create title
        const title = document.createElement('div');
        title.className = 'panel-title';
        title.textContent = 'EVENT LOG';
        title.style.textAlign = 'center';
        title.style.marginBottom = '10px';
        title.style.fontSize = '1.4rem';
        title.style.textShadow = '0 0 10px #00ff00';

        // Create log container with scroll
        this.logContainer = document.createElement('div');
        this.logContainer.className = 'log-entries';
        Object.assign(this.logContainer.style, {
            flex: '1',
            overflowY: 'auto',
            overflowX: 'hidden', // Prevent horizontal scroll
            border: `1px solid ${this.computedStyles.borderColor}`,
            padding: '10px',
            backgroundColor: 'rgba(0, 255, 0, 0.05)',
            fontSize: '0.9rem',
            minHeight: '0', // Allow flex item to shrink below content size
            maxHeight: '100%', // Don't exceed container height
            wordWrap: 'break-word', // Wrap long words
            boxSizing: 'border-box' // Include padding/border in size calculation
        });

        // Create footer with controls
        const footer = document.createElement('div');
        footer.className = 'log-footer';
        footer.style.marginTop = '10px';
        footer.style.textAlign = 'center';
        footer.style.fontSize = '0.8rem';
        footer.style.color = '#666666';

        const eventCount = document.createElement('span');
        eventCount.textContent = `Events: ${this.events.length}/${this.maxEvents}`;
        footer.appendChild(eventCount);

        // Assemble the log panel
        logPanel.appendChild(title);
        logPanel.appendChild(this.logContainer);
        logPanel.appendChild(footer);

        // Add to container
        container.appendChild(logPanel);

        // Initialize with some default events for testing
        this.addEvent('WOPR system initialized', 'system');
        this.addEvent('Event log activated', 'system');

        console.log('EventLog rendered');
    }

    /**
     * Destroy the event log and clean up resources
     */
    destroy() {
        this.hide();
        this.clear();
        
        if (this.container && this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        
        this.container = null;
        this.logContainer = null;
        
        console.log('EventLog destroyed');
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventLog };
} else if (typeof window !== 'undefined') {
    window.EventLog = EventLog;
}