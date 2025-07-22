# Week 7: Refrigerated (Reefer) Freight

**Status**: TODO

## Temperature-Controlled Additions

### 1. Temperature Monitoring Integration

```python
# reefer_requirements.py
"""
Refrigerated Freight Requirements Handler

BUSINESS LOGIC:
- Validates temperature requirements
- Ensures cold chain compliance
- Adds reefer-specific costs
- Tracks FSMA compliance
"""

class ReeferHandler:
    def __init__(self):
        self.temp_ranges = {
            'frozen': (-10, 0),      # Frozen foods
            'fresh': (33, 39),       # Produce, dairy
            'controlled': (55, 65),  # Beverages, chocolate
            'heated': (100, 180),    # Hot foods, chemicals
        }
    
    def validate_reefer_requirements(self, load_data: Dict) -> Dict:
        """Validate and enhance reefer load requirements"""
        
        temp_requirement = load_data.get('temperature')
        commodity = load_data.get('commodity', '').lower()
        
        # Infer temperature if not specified
        if not temp_requirement:
            temp_requirement = self._infer_temperature(commodity)
        
        # Validate temperature range
        validation_result = {
            'valid': True,
            'temperature_range': temp_requirement,
            'continuous_monitoring': True,
            'pre_cool_required': True,
            'fuel_surcharge': 0.15,  # 15% additional for reefer fuel
            'compliance_notes': []
        }
        
        # FSMA compliance checks
        if 'food' in commodity or 'produce' in commodity:
            validation_result['compliance_notes'].append(
                'FSMA Sanitary Transportation compliance required'
            )
            validation_result['washout_required'] = True
        
        return validation_result
    
    def calculate_reefer_adjustments(self, base_rate: float, 
                                    distance: int,
                                    temp_data: Dict) -> float:
        """Calculate reefer-specific rate adjustments"""
        
        # Base reefer multiplier (30-50% higher than dry van)
        reefer_multiplier = 1.35
        
        # Temperature severity adjustment
        if temp_data.get('temperature_range') == 'frozen':
            reefer_multiplier += 0.10
        
        # Fuel adjustment for reefer unit
        fuel_adjustment = base_rate * temp_data.get('fuel_surcharge', 0.15)
        
        # Long haul adjustment (more fuel for reefer unit)
        if distance > 1000:
            fuel_adjustment *= 1.2
        
        adjusted_rate = (base_rate * reefer_multiplier) + fuel_adjustment
        
        return adjusted_rate
```

### 2. Temperature Compliance Tracking

```python
# reefer_compliance.py
"""
Refrigerated Freight Compliance System

BUSINESS LOGIC:
- FSMA compliance verification
- Temperature monitoring requirements
- Documentation requirements
- Carrier certification tracking
"""

class ReeferComplianceManager:
    def __init__(self):
        self.fsma_requirements = {
            'temperature_monitoring': True,
            'sanitary_transport': True,
            'trained_personnel': True,
            'written_procedures': True,
            'records_retention': '12_months'
        }
    
    def verify_carrier_compliance(self, carrier_id: str, load_type: str) -> Dict:
        """Verify carrier meets reefer compliance requirements"""
        
        carrier_certs = self._get_carrier_certifications(carrier_id)
        
        compliance_check = {
            'compliant': True,
            'certifications': [],
            'missing_requirements': [],
            'warnings': []
        }
        
        # Check FSMA compliance for food products
        if load_type in ['produce', 'food', 'beverage']:
            if 'FSMA_CERTIFIED' not in carrier_certs:
                compliance_check['compliant'] = False
                compliance_check['missing_requirements'].append('FSMA Certification')
        
        # Check temperature monitoring capability
        if 'TEMP_MONITORING' not in carrier_certs:
            compliance_check['warnings'].append(
                'Carrier lacks real-time temperature monitoring'
            )
        
        # Check equipment age (older equipment less reliable)
        equipment_age = self._get_average_equipment_age(carrier_id)
        if equipment_age > 7:
            compliance_check['warnings'].append(
                f'Average reefer unit age: {equipment_age} years'
            )
        
        return compliance_check
    
    def generate_temp_requirements_doc(self, load_data: Dict) -> str:
        """Generate temperature requirements document for carrier"""
        
        temp_doc = f"""
        TEMPERATURE REQUIREMENTS - Load #{load_data['id']}
        
        Origin: {load_data['origin_city']}, {load_data['origin_state']}
        Destination: {load_data['dest_city']}, {load_data['dest_state']}
        
        TEMPERATURE SPECIFICATIONS:
        - Set Point: {load_data['temperature']}°F
        - Acceptable Range: {load_data['temp_min']}°F - {load_data['temp_max']}°F
        - Pre-Cool Required: {'Yes' if load_data.get('pre_cool') else 'No'}
        - Continuous Recording: Required
        
        COMMODITY: {load_data['commodity']}
        
        SPECIAL INSTRUCTIONS:
        {load_data.get('special_instructions', 'None')}
        
        COMPLIANCE REQUIREMENTS:
        - Download temperature recorder data at delivery
        - Maintain temperature logs for 12 months
        - Report any temperature excursions immediately
        
        Emergency Contact: 1-800-COLD-CHAIN
        """
        
        return temp_doc
```

### 3. Reefer-Specific UI Components

```typescript
// components/reefer/TemperatureRequirements.tsx
export function TemperatureRequirements({ onChange }: Props) {
  const [requirements, setRequirements] = useState({
    temperature: '',
    tempMin: '',
    tempMax: '',
    preCool: false,
    continuousMonitoring: true,
    commodity: '',
  })
  
  const presetTemps = {
    'Frozen Foods': { temp: '-10', min: '-15', max: '0' },
    'Fresh Produce': { temp: '34', min: '33', max: '39' },
    'Dairy Products': { temp: '36', min: '33', max: '39' },
    'Beverages': { temp: '38', min: '35', max: '45' },
    'Chocolate': { temp: '60', min: '55', max: '65' },
  }
  
  const applyPreset = (preset: string) => {
    const settings = presetTemps[preset]
    setRequirements({
      ...requirements,
      temperature: settings.temp,
      tempMin: settings.min,
      tempMax: settings.max,
    })
    onChange(requirements)
  }
  
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Temperature Requirements</h3>
      
      <div className="flex gap-2">
        {Object.keys(presetTemps).map(preset => (
          <button
            key={preset}
            onClick={() => applyPreset(preset)}
            className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
          >
            {preset}
          </button>
        ))}
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm">Set Point (°F)</label>
          <input
            type="number"
            value={requirements.temperature}
            onChange={(e) => setRequirements({...requirements, temperature: e.target.value})}
            className="w-full mt-1 border rounded px-3 py-2"
          />
        </div>
        
        <div>
          <label className="block text-sm">Min Temp (°F)</label>
          <input
            type="number"
            value={requirements.tempMin}
            onChange={(e) => setRequirements({...requirements, tempMin: e.target.value})}
            className="w-full mt-1 border rounded px-3 py-2"
          />
        </div>
        
        <div>
          <label className="block text-sm">Max Temp (°F)</label>
          <input
            type="number"
            value={requirements.tempMax}
            onChange={(e) => setRequirements({...requirements, tempMax: e.target.value})}
            className="w-full mt-1 border rounded px-3 py-2"
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={requirements.preCool}
            onChange={(e) => setRequirements({...requirements, preCool: e.target.checked})}
            className="mr-2"
          />
          Pre-cooling required
        </label>
        
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={requirements.continuousMonitoring}
            onChange={(e) => setRequirements({...requirements, continuousMonitoring: e.target.checked})}
            className="mr-2"
          />
          Continuous temperature monitoring
        </label>
      </div>
      
      <div className="p-3 bg-blue-50 rounded text-sm">
        <p className="font-semibold">FSMA Compliance Note:</p>
        <p>Food products require FSMA-certified carriers with documented temperature control procedures.</p>
      </div>
    </div>
  )
}
```

## Key Features for Reefer

1. **Temperature Management**
   - Set point configuration
   - Min/max range tolerances
   - Pre-cooling requirements
   - Continuous monitoring setup

2. **Compliance Tracking**
   - FSMA certification verification
   - Carrier equipment validation
   - Temperature log requirements
   - Washout documentation

3. **Rate Adjustments**
   - 30-50% premium over dry van
   - Fuel surcharge for reefer unit
   - Distance-based adjustments
   - Temperature severity factors

4. **Carrier Selection**
   - Reefer-certified carriers only
   - Equipment age consideration
   - Temperature monitoring capability
   - Compliance history

## Testing Considerations

- Verify temperature range validations
- Test FSMA compliance checks
- Validate rate calculations with fuel surcharges
- Test carrier filtering for reefer capability
- Verify temperature documentation generation

## Next Steps
- Integrate with temperature monitoring APIs
- Build FSMA compliance database
- Create temperature excursion alerts
- Add multi-temp zone support
- Implement cold chain verification