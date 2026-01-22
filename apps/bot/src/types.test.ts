import { describe, it, expect } from 'vitest';
import { COMPARTMENTS } from './types.js';

describe('EA Bot Types', () => {
  describe('COMPARTMENTS', () => {
    it('should have all required compartments', () => {
      const expectedCompartments = [
        'personal',
        'finance',
        'health',
        'travel',
        'builds',
        'brand',
        'career',
      ];

      for (const name of expectedCompartments) {
        expect(COMPARTMENTS[name]).toBeDefined();
        expect(COMPARTMENTS[name].name).toBe(name);
      }
    });

    it('should have correct write confirmation settings', () => {
      // Finance and career require confirmation
      expect(COMPARTMENTS.finance.writeConfirmation).toBe(true);
      expect(COMPARTMENTS.career.writeConfirmation).toBe(true);

      // Others do not require confirmation
      expect(COMPARTMENTS.personal.writeConfirmation).toBe(false);
      expect(COMPARTMENTS.health.writeConfirmation).toBe(false);
      expect(COMPARTMENTS.travel.writeConfirmation).toBe(false);
      expect(COMPARTMENTS.builds.writeConfirmation).toBe(false);
      expect(COMPARTMENTS.brand.writeConfirmation).toBe(false);
    });

    it('should have descriptions for all compartments', () => {
      for (const [_name, compartment] of Object.entries(COMPARTMENTS)) {
        expect(compartment.description).toBeTruthy();
        expect(typeof compartment.description).toBe('string');
        expect(compartment.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Compartment structure', () => {
    it('each compartment should have required properties', () => {
      for (const [_name, compartment] of Object.entries(COMPARTMENTS)) {
        expect(compartment).toHaveProperty('name');
        expect(compartment).toHaveProperty('description');
        expect(compartment).toHaveProperty('writeConfirmation');
        expect(typeof compartment.name).toBe('string');
        expect(typeof compartment.description).toBe('string');
        expect(typeof compartment.writeConfirmation).toBe('boolean');
      }
    });
  });
});

describe('ClaudeResponse interface validation', () => {
  it('should allow valid ClaudeResponse objects', () => {
    const successResponse = {
      success: true,
      content: 'Test response content',
    };

    const errorResponse = {
      success: false,
      content: '',
      error: 'Something went wrong',
    };

    expect(successResponse.success).toBe(true);
    expect(successResponse.content).toBe('Test response content');
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toBe('Something went wrong');
  });
});
