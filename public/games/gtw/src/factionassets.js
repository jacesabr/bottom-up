/**
 * Faction Assets System for Global Thermonuclear War
 * Manages cities, military bases, and submarine launch points for both superpowers
 */

class FactionAssets {
    constructor() {
        // Asset type definitions with visual properties
        this.assetTypes = {
            city: {
                icon: '🏙️',
                color: '#ffff00',
                size: 8,
                shape: 'circle',
                strokeWidth: 2,
                priority: 3
            },
            militaryBase: {
                icon: '🏭',
                color: '#ff6600',
                size: 6,
                shape: 'square',
                strokeWidth: 2,
                priority: 2
            },
            submarine: {
                icon: '🚢',
                color: '#0066cc',
                size: 5,
                shape: 'triangle',
                strokeWidth: 1,
                priority: 1
            }
        };

        // Faction asset data
        this.factionData = {
            us: {
                cities: [
                    { id: 'us-city-1', name: 'New York', type: 'city', faction: 'us', coordinates: { x: 26, y: 42 }, population: 8400000, status: 'active' },
                    { id: 'us-city-2', name: 'Los Angeles', type: 'city', faction: 'us', coordinates: { x: 12, y: 48 }, population: 3970000, status: 'active' },
                    { id: 'us-city-3', name: 'Chicago', type: 'city', faction: 'us', coordinates: { x: 22, y: 44 }, population: 2710000, status: 'active' },
                    { id: 'us-city-4', name: 'Houston', type: 'city', faction: 'us', coordinates: { x: 18, y: 52 }, population: 2300000, status: 'active' },
                    { id: 'us-city-5', name: 'Phoenix', type: 'city', faction: 'us', coordinates: { x: 14, y: 50 }, population: 1680000, status: 'active' },
                    { id: 'us-city-6', name: 'Philadelphia', type: 'city', faction: 'us', coordinates: { x: 27, y: 43 }, population: 1580000, status: 'active' },
                    { id: 'us-city-7', name: 'San Antonio', type: 'city', faction: 'us', coordinates: { x: 17, y: 53 }, population: 1530000, status: 'active' },
                    { id: 'us-city-8', name: 'San Diego', type: 'city', faction: 'us', coordinates: { x: 11, y: 49 }, population: 1420000, status: 'active' },
                    { id: 'us-city-9', name: 'Dallas', type: 'city', faction: 'us', coordinates: { x: 19, y: 51 }, population: 1340000, status: 'active' },
                    { id: 'us-city-10', name: 'San Jose', type: 'city', faction: 'us', coordinates: { x: 9, y: 46 }, population: 1020000, status: 'active' },
                    { id: 'us-city-11', name: 'Austin', type: 'city', faction: 'us', coordinates: { x: 18, y: 52 }, population: 965000, status: 'active' },
                    { id: 'us-city-12', name: 'Jacksonville', type: 'city', faction: 'us', coordinates: { x: 25, y: 55 }, population: 950000, status: 'active' }
                ],
                militaryBases: [
                    { id: 'us-base-1', name: 'NORAD/Cheyenne Mountain', type: 'militaryBase', faction: 'us', coordinates: { x: 16, y: 46 }, classification: 'Strategic Command', status: 'active' },
                    { id: 'us-base-2', name: 'Pentagon', type: 'militaryBase', faction: 'us', coordinates: { x: 26, y: 44 }, classification: 'Command Center', status: 'active' },
                    { id: 'us-base-3', name: 'Norfolk Naval Base', type: 'militaryBase', faction: 'us', coordinates: { x: 27, y: 45 }, classification: 'Naval Operations', status: 'active' },
                    { id: 'us-base-4', name: 'Offutt Air Force Base', type: 'militaryBase', faction: 'us', coordinates: { x: 20, y: 44 }, classification: 'Strategic Air Command', status: 'active' },
                    { id: 'us-base-5', name: 'Edwards Air Force Base', type: 'militaryBase', faction: 'us', coordinates: { x: 11, y: 48 }, classification: 'Test Center', status: 'active' },
                    { id: 'us-base-6', name: 'Fort Knox', type: 'militaryBase', faction: 'us', coordinates: { x: 23, y: 46 }, classification: 'Armored Division', status: 'active' },
                    { id: 'us-base-7', name: 'Naval Air Station Pensacola', type: 'militaryBase', faction: 'us', coordinates: { x: 23, y: 56 }, classification: 'Naval Aviation', status: 'active' },
                    { id: 'us-base-8', name: 'Malmstrom Air Force Base', type: 'militaryBase', faction: 'us', coordinates: { x: 17, y: 39 }, classification: 'ICBM Wing', status: 'active' }
                ],
                submarines: [
                    { id: 'us-sub-1', name: 'USS Ohio (SSBN-726)', type: 'submarine', faction: 'us', coordinates: { x: 8, y: 35 }, class: 'Ohio-class', status: 'active' },
                    { id: 'us-sub-2', name: 'USS Michigan (SSBN-727)', type: 'submarine', faction: 'us', coordinates: { x: 5, y: 45 }, class: 'Ohio-class', status: 'active' },
                    { id: 'us-sub-3', name: 'USS Florida (SSBN-728)', type: 'submarine', faction: 'us', coordinates: { x: 30, y: 50 }, class: 'Ohio-class', status: 'active' },
                    { id: 'us-sub-4', name: 'USS Georgia (SSBN-729)', type: 'submarine', faction: 'us', coordinates: { x: 32, y: 40 }, class: 'Ohio-class', status: 'active' }
                ]
            },
            ussr: {
                cities: [
                    { id: 'ussr-city-1', name: 'Moscow', type: 'city', faction: 'ussr', coordinates: { x: 65, y: 35 }, population: 8900000, status: 'active' },
                    { id: 'ussr-city-2', name: 'Leningrad', type: 'city', faction: 'ussr', coordinates: { x: 62, y: 28 }, population: 5000000, status: 'active' },
                    { id: 'ussr-city-3', name: 'Kiev', type: 'city', faction: 'ussr', coordinates: { x: 62, y: 38 }, population: 2600000, status: 'active' },
                    { id: 'ussr-city-4', name: 'Tashkent', type: 'city', faction: 'ussr', coordinates: { x: 75, y: 44 }, population: 2000000, status: 'active' },
                    { id: 'ussr-city-5', name: 'Baku', type: 'city', faction: 'ussr', coordinates: { x: 70, y: 42 }, population: 1750000, status: 'active' },
                    { id: 'ussr-city-6', name: 'Kharkov', type: 'city', faction: 'ussr', coordinates: { x: 63, y: 38 }, population: 1600000, status: 'active' },
                    { id: 'ussr-city-7', name: 'Gorky', type: 'city', faction: 'ussr', coordinates: { x: 68, y: 35 }, population: 1400000, status: 'active' },
                    { id: 'ussr-city-8', name: 'Novosibirsk', type: 'city', faction: 'ussr', coordinates: { x: 82, y: 36 }, population: 1400000, status: 'active' },
                    { id: 'ussr-city-9', name: 'Minsk', type: 'city', faction: 'ussr', coordinates: { x: 59, y: 35 }, population: 1350000, status: 'active' },
                    { id: 'ussr-city-10', name: 'Sverdlovsk', type: 'city', faction: 'ussr', coordinates: { x: 73, y: 34 }, population: 1300000, status: 'active' },
                    { id: 'ussr-city-11', name: 'Tbilisi', type: 'city', faction: 'ussr', coordinates: { x: 69, y: 43 }, population: 1200000, status: 'active' },
                    { id: 'ussr-city-12', name: 'Dnepropetrovsk', type: 'city', faction: 'ussr', coordinates: { x: 63, y: 40 }, population: 1150000, status: 'active' }
                ],
                militaryBases: [
                    { id: 'ussr-base-1', name: 'Kremlin Command Center', type: 'militaryBase', faction: 'ussr', coordinates: { x: 65, y: 35 }, classification: 'Supreme Command', status: 'active' },
                    { id: 'ussr-base-2', name: 'Plesetsk Cosmodrome', type: 'militaryBase', faction: 'ussr', coordinates: { x: 67, y: 25 }, classification: 'Space/ICBM', status: 'active' },
                    { id: 'ussr-base-3', name: 'Severodvinsk Naval Base', type: 'militaryBase', faction: 'ussr', coordinates: { x: 67, y: 22 }, classification: 'Naval Construction', status: 'active' },
                    { id: 'ussr-base-4', name: 'Baikonur Cosmodrome', type: 'militaryBase', faction: 'ussr', coordinates: { x: 76, y: 42 }, classification: 'Space Center', status: 'active' },
                    { id: 'ussr-base-5', name: 'Semipalatinsk Test Site', type: 'militaryBase', faction: 'ussr', coordinates: { x: 80, y: 38 }, classification: 'Nuclear Test', status: 'active' },
                    { id: 'ussr-base-6', name: 'Murmansk Naval Base', type: 'militaryBase', faction: 'ussr', coordinates: { x: 65, y: 18 }, classification: 'Northern Fleet', status: 'active' },
                    { id: 'ussr-base-7', name: 'Vladivostok Naval Base', type: 'militaryBase', faction: 'ussr', coordinates: { x: 95, y: 42 }, classification: 'Pacific Fleet', status: 'active' },
                    { id: 'ussr-base-8', name: 'Engels Air Base', type: 'militaryBase', faction: 'ussr', coordinates: { x: 70, y: 37 }, classification: 'Strategic Bomber', status: 'active' }
                ],
                submarines: [
                    { id: 'ussr-sub-1', name: 'Red October (Typhoon-class)', type: 'submarine', faction: 'ussr', coordinates: { x: 60, y: 15 }, class: 'Typhoon-class', status: 'active' },
                    { id: 'ussr-sub-2', name: 'Leningrad (Delta-class)', type: 'submarine', faction: 'ussr', coordinates: { x: 45, y: 25 }, class: 'Delta-class', status: 'active' },
                    { id: 'ussr-sub-3', name: 'Severodvinsk (Delta-class)', type: 'submarine', faction: 'ussr', coordinates: { x: 75, y: 20 }, class: 'Delta-class', status: 'active' },
                    { id: 'ussr-sub-4', name: 'Arkhangelsk (Typhoon-class)', type: 'submarine', faction: 'ussr', coordinates: { x: 90, y: 30 }, class: 'Typhoon-class', status: 'active' }
                ]
            }
        };

        // Asset lookup index
        this.assetIndex = {};
        this.buildAssetIndex();
    }

    /**
     * Build searchable index of all assets
     */
    buildAssetIndex() {
        this.assetIndex = {};
        
        ['us', 'ussr'].forEach(faction => {
            ['cities', 'militaryBases', 'submarines'].forEach(category => {
                this.factionData[faction][category].forEach(asset => {
                    this.assetIndex[asset.id] = asset;
                });
            });
        });
    }

    /**
     * Get all assets for a faction
     */
    getAssets(faction) {
        if (!this.factionData[faction]) {
            console.warn(`Invalid faction: ${faction}`);
            return null;
        }
        
        return {
            cities: [...this.factionData[faction].cities],
            militaryBases: [...this.factionData[faction].militaryBases],
            submarines: [...this.factionData[faction].submarines]
        };
    }

    /**
     * Get asset type definitions
     */
    getAssetTypes() {
        return { ...this.assetTypes };
    }

    /**
     * Find asset by ID
     */
    getAssetById(id) {
        return this.assetIndex[id] || null;
    }

    /**
     * Find asset by name
     */
    findAssetByName(name) {
        return Object.values(this.assetIndex).find(asset => 
            asset.name.toLowerCase() === name.toLowerCase()
        ) || null;
    }

    /**
     * Get assets by type
     */
    getAssetsByType(type) {
        return Object.values(this.assetIndex).filter(asset => asset.type === type);
    }

    /**
     * Get assets by faction
     */
    getAssetsByFaction(faction) {
        return Object.values(this.assetIndex).filter(asset => asset.faction === faction);
    }

    /**
     * Get assets by status
     */
    getAssetsByStatus(status) {
        return Object.values(this.assetIndex).filter(asset => asset.status === status);
    }

    /**
     * Set asset status
     */
    setAssetStatus(id, status) {
        const validStatuses = ['active', 'damaged', 'destroyed', 'offline'];
        
        if (!validStatuses.includes(status)) {
            console.warn(`Invalid status: ${status}`);
            return false;
        }

        const asset = this.getAssetById(id);
        if (!asset) {
            console.warn(`Asset not found: ${id}`);
            return false;
        }

        asset.status = status;
        console.log(`Asset ${asset.name} status changed to: ${status}`);
        return true;
    }

    /**
     * Get all active assets
     */
    getActiveAssets() {
        return this.getAssetsByStatus('active');
    }

    /**
     * Get all destroyed assets
     */
    getDestroyedAssets() {
        return this.getAssetsByStatus('destroyed');
    }

    /**
     * Get assets within a region
     */
    getAssetsInRegion(minX, minY, maxX, maxY) {
        return Object.values(this.assetIndex).filter(asset => {
            const x = asset.coordinates.x;
            const y = asset.coordinates.y;
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        });
    }

    /**
     * Get asset statistics
     */
    getAssetStatistics() {
        const stats = {
            total: 0,
            byFaction: { us: 0, ussr: 0 },
            byType: { city: 0, militaryBase: 0, submarine: 0 },
            byStatus: { active: 0, damaged: 0, destroyed: 0, offline: 0 }
        };

        Object.values(this.assetIndex).forEach(asset => {
            stats.total++;
            stats.byFaction[asset.faction]++;
            stats.byType[asset.type]++;
            stats.byStatus[asset.status]++;
        });

        return stats;
    }

    /**
     * Validate asset data
     */
    validateAsset(asset) {
        const required = ['id', 'name', 'type', 'faction', 'coordinates', 'status'];
        
        for (const field of required) {
            if (!asset.hasOwnProperty(field)) {
                return { valid: false, error: `Missing required field: ${field}` };
            }
        }

        if (!this.assetTypes[asset.type]) {
            return { valid: false, error: `Invalid asset type: ${asset.type}` };
        }

        if (!['us', 'ussr'].includes(asset.faction)) {
            return { valid: false, error: `Invalid faction: ${asset.faction}` };
        }

        if (typeof asset.coordinates.x !== 'number' || typeof asset.coordinates.y !== 'number') {
            return { valid: false, error: 'Invalid coordinates' };
        }

        return { valid: true };
    }

    /**
     * Get faction color scheme
     */
    getFactionColors(faction) {
        const colors = {
            us: {
                primary: '#0066cc',
                secondary: '#ffffff',
                accent: '#ff0000'
            },
            ussr: {
                primary: '#cc0000',
                secondary: '#ffff00',
                accent: '#ffffff'
            }
        };

        return colors[faction] || colors.us;
    }

    /**
     * Calculate total population by faction
     */
    getTotalPopulation(faction) {
        const assets = this.getAssets(faction);
        if (!assets) return 0;

        return assets.cities.reduce((total, city) => {
            return total + (city.population || 0);
        }, 0);
    }

    /**
     * Get strategic value of asset
     */
    getAssetValue(asset) {
        const baseValues = {
            city: asset.population ? Math.log10(asset.population) * 100 : 500,
            militaryBase: 800,
            submarine: 600
        };

        return baseValues[asset.type] || 100;
    }

    /**
     * Get count of destroyed assets by faction
     */
    getDestroyedAssetCount(faction) {
        return this.getAssetsByFaction(faction).filter(asset => asset.status === 'destroyed').length;
    }

    /**
     * Get total count of assets by faction
     */
    getTotalAssetCount(faction) {
        return this.getAssetsByFaction(faction).length;
    }

    /**
     * Reset all assets to active status
     */
    resetAllAssets() {
        Object.values(this.assetIndex).forEach(asset => {
            asset.status = 'active';
        });
        console.log('All assets reset to active status');
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FactionAssets };
} else if (typeof window !== 'undefined') {
    window.FactionAssets = FactionAssets;
}