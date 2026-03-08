-- Migration 009: Domain Specific Templates
-- Implements support for selecting domain-specific context at project start.

CREATE TABLE domain_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  industry          TEXT,
  focus_areas       TEXT[],       -- e.g. ["ROI", "Process Efficiency"]
  default_questions TEXT[],       -- for Step 3
  typical_bottlenecks TEXT[],     -- for Step 2
  prompt_injection_context TEXT,  -- Hidden context to inject into AI prompts
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Link projects to templates
ALTER TABLE consulting_projects 
ADD COLUMN domain_template_id UUID REFERENCES domain_templates(id);

-- Seed default templates
INSERT INTO domain_templates (name, description, industry, focus_areas, default_questions, typical_bottlenecks, prompt_injection_context)
VALUES 
('ERP System Implementation', 'Audit and optimization for ERP migrations', 'Manufacturing', 
 ARRAY['Data Integrity', 'Process Standardization', 'User Adoption'],
 ARRAY['How do you handle current data migrations?', 'Which modules are most critical?', 'What is the level of user resistance observed?'],
 ARRAY['Manual data entry duplication', 'Lack of real-time visibility', 'Fragmented data silos'],
 'The consultant is focused on ERP migration risk and post-implementation ROI. Prioritize data standardization and automation of cross-module workflows.'),
 
('Logistics & supply chain', 'Optimization for warehouse and transport', 'Logistics', 
 ARRAY['Throughput', 'Inventory Accuracy', 'Last-mile delivery'],
 ARRAY['What is your current warehouse occupancy?', 'How do you track fleet maintenance?', 'What is your average lead time for cross-docking?'],
 ARRAY['Paper-based inventory tracking', 'Inefficient route planning', 'Poor warehouse space utilization'],
 'The user is a supply chain director. Focus on IoT-driven visibility, warehouse automation, and route optimization algorithms.'),

('Human Resources Automation', 'Streamlining recruitment and onboarding', 'Professional Services', 
 ARRAY['Time to Hire', 'Onboarding Experience', 'Compliance'],
 ARRAY['How do you manage candidate communication?', 'Which systems are used for background checks?', 'What is the biggest friction point in onboarding?'],
 ARRAY['High administrative burden on HR staff', 'Delayed onboarding feedback loops', 'Inconsistent interview documentation'],
 'Focus on candidate experience, automation of repetitive admin tasks, and data-driven talent acquisition strategies.');
