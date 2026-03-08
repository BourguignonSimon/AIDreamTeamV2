-- Migration 009: Domain Template Seed Data
-- The domain_templates table and the domain_template_id FK column on
-- consulting_projects are defined in 002_tables.sql so that the FK
-- reference is valid at schema creation time (BUG-05).
-- This migration only seeds the default template rows.

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
 'Focus on candidate experience, automation of repetitive admin tasks, and data-driven talent acquisition strategies.')
ON CONFLICT DO NOTHING;
