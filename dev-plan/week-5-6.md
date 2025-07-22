# Week 5-6: LTL Quoting

**Status**: TODO

## LTL-Specific Enhancements

### 1. Freight Classification Engine

```python
# ltl_classifier.py
"""
LTL Freight Classification System

BUSINESS LOGIC:
- Determines NMFC class based on density, stowability, handling, liability
- Higher classes (85-500) cost more than lower classes (50-77.5)
- Accurate classification prevents costly reclassification charges
"""

class LTLClassifier:
    def __init__(self):
        self.density_breaks = {
            50: 50,      # >= 50 lbs/cu ft
            55: 35,      # >= 35 lbs/cu ft
            60: 30,      # >= 30 lbs/cu ft
            65: 22.5,    # >= 22.5 lbs/cu ft
            70: 15,      # >= 15 lbs/cu ft
            77.5: 13.5,  # >= 13.5 lbs/cu ft
            85: 12,      # >= 12 lbs/cu ft
            92.5: 10.5,  # >= 10.5 lbs/cu ft
            100: 9,      # >= 9 lbs/cu ft
            110: 8,      # >= 8 lbs/cu ft
            125: 7,      # >= 7 lbs/cu ft
            150: 6,      # >= 6 lbs/cu ft
            175: 5,      # >= 5 lbs/cu ft
            200: 4,      # >= 4 lbs/cu ft
            250: 3,      # >= 3 lbs/cu ft
            300: 2,      # >= 2 lbs/cu ft
            400: 1,      # >= 1 lbs/cu ft
            500: 0       # < 1 lbs/cu ft
        }
    
    def calculate_density(self, weight_lbs: float, 
                        length_in: float, 
                        width_in: float, 
                        height_in: float) -> float:
        """Calculate shipment density"""
        cubic_feet = (length_in * width_in * height_in) / 1728
        return weight_lbs / cubic_feet if cubic_feet > 0 else 0
    
    def get_freight_class(self, commodity: str, 
                        weight_lbs: float,
                        dimensions: Dict) -> Dict:
        """Determine freight class with confidence scoring"""
        
        # Calculate density if dimensions provided
        if all(dimensions.get(d) for d in ['length', 'width', 'height']):
            density = self.calculate_density(
                weight_lbs,
                dimensions['length'],
                dimensions['width'],
                dimensions['height']
            )
            
            # Find appropriate class based on density
            for freight_class, min_density in self.density_breaks.items():
                if density >= min_density:
                    return {
                        'class': freight_class,
                        'density': density,
                        'confidence': 0.85,
                        'method': 'density_calculation'
                    }
        
        # Fall back to commodity-based classification
        return self._classify_by_commodity(commodity, weight_lbs)
```

### 2. Multi-Carrier Rate Shopping

```python
# ltl_rate_engine.py
"""
LTL Rate Shopping Engine

BUSINESS LOGIC:
- Queries multiple LTL carriers for rates
- Considers transit time vs cost tradeoffs
- Applies accessorial charges correctly
- Returns best options for customer choice
"""

class LTLRateEngine:
    def __init__(self):
        self.carriers = {
            'fedex_freight': FedExFreightAPI(),
            'old_dominion': OldDominionAPI(),
            'xpo': XPOAPI(),
            'estes': EstesAPI(),
            'yrc': YRCAPI(),
        }
    
    async def get_ltl_quotes(self, shipment_data: Dict) -> List[Dict]:
        """Get quotes from multiple LTL carriers"""
        
        # Prepare rate request
        rate_request = {
            'origin_zip': shipment_data['origin_zip'],
            'dest_zip': shipment_data['dest_zip'],
            'freight_class': shipment_data['freight_class'],
            'weight': shipment_data['weight_lbs'],
            'pieces': shipment_data.get('piece_count', 1),
            'accessorials': self._determine_accessorials(shipment_data),
            'pickup_date': shipment_data['pickup_date'],
        }
        
        # Query carriers in parallel
        tasks = []
        for carrier_name, carrier_api in self.carriers.items():
            task = self._get_carrier_rate(carrier_name, carrier_api, rate_request)
            tasks.append(task)
        
        quotes = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter and sort valid quotes
        valid_quotes = [q for q in quotes if not isinstance(q, Exception)]
        
        # Sort by combination of price and transit time
        scored_quotes = self._score_quotes(valid_quotes)
        
        return scored_quotes[:5]  # Return top 5 options
    
    def _determine_accessorials(self, shipment_data: Dict) -> List[str]:
        """Determine required accessorial services"""
        accessorials = []
        
        if shipment_data.get('residential_pickup'):
            accessorials.append('RESIDENTIAL_PICKUP')
        if shipment_data.get('residential_delivery'):
            accessorials.append('RESIDENTIAL_DELIVERY')
        if shipment_data.get('liftgate_pickup'):
            accessorials.append('LIFTGATE_PICKUP')
        if shipment_data.get('liftgate_delivery'):
            accessorials.append('LIFTGATE_DELIVERY')
        if shipment_data.get('inside_pickup'):
            accessorials.append('INSIDE_PICKUP')
        if shipment_data.get('inside_delivery'):
            accessorials.append('INSIDE_DELIVERY')
        if shipment_data.get('appointment_required'):
            accessorials.append('APPOINTMENT')
            
        return accessorials
```

## Key Features for LTL

### Freight Class Calculator UI
```typescript
// components/ltl/FreightClassCalculator.tsx
export function FreightClassCalculator({ onClassDetermined }: Props) {
  const [dimensions, setDimensions] = useState({
    length: '',
    width: '',
    height: '',
    weight: '',
  })
  
  const calculateClass = () => {
    const density = calculateDensity(dimensions)
    const freightClass = getFreightClass(density)
    onClassDetermined(freightClass)
  }
  
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Calculate Freight Class</h3>
      <div className="grid grid-cols-2 gap-4">
        <input 
          placeholder="Length (inches)"
          value={dimensions.length}
          onChange={(e) => setDimensions({...dimensions, length: e.target.value})}
        />
        <input 
          placeholder="Width (inches)"
          value={dimensions.width}
          onChange={(e) => setDimensions({...dimensions, width: e.target.value})}
        />
        <input 
          placeholder="Height (inches)"
          value={dimensions.height}
          onChange={(e) => setDimensions({...dimensions, height: e.target.value})}
        />
        <input 
          placeholder="Weight (lbs)"
          value={dimensions.weight}
          onChange={(e) => setDimensions({...dimensions, weight: e.target.value})}
        />
      </div>
      <button onClick={calculateClass} className="btn-primary">
        Calculate Class
      </button>
    </div>
  )
}
```

### Accessorial Services Selection
```typescript
// components/ltl/AccessorialServices.tsx
export function AccessorialServices({ onChange }: Props) {
  const [services, setServices] = useState({
    residential_pickup: false,
    residential_delivery: false,
    liftgate_pickup: false,
    liftgate_delivery: false,
    inside_pickup: false,
    inside_delivery: false,
    appointment_required: false,
    hazmat: false,
  })
  
  const handleChange = (service: string) => {
    const updated = { ...services, [service]: !services[service] }
    setServices(updated)
    onChange(updated)
  }
  
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Accessorial Services</h3>
      {Object.entries(services).map(([key, value]) => (
        <label key={key} className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={value}
            onChange={() => handleChange(key)}
          />
          <span>{formatServiceName(key)}</span>
        </label>
      ))}
    </div>
  )
}
```

## Key Differences from FTL

1. **Freight Classification**: Critical for accurate pricing
2. **Multiple Pieces**: Handle pallet counts and dimensions
3. **Accessorial Charges**: Many more options than FTL
4. **Transit Times**: Generally longer than FTL
5. **Carrier Selection**: Different carrier set with regional strengths
6. **Terminal Handling**: Additional handling at origin/destination terminals

## Testing Considerations

- Test freight class calculations with various densities
- Verify accessorial charge applications
- Test multi-piece shipments
- Validate carrier API integrations
- Test rate shopping algorithm performance

## Next Steps
- Integrate with major LTL carrier APIs
- Build commodity-to-class mapping database
- Create LTL-specific quote templates
- Add terminal location lookup
- Implement transit time estimates