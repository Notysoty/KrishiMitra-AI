import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CropManager, Crop } from './CropManager';

const makeCrop = (overrides: Partial<Crop> = {}): Crop => ({
  id: '1',
  type: 'Rice',
  variety: 'Basmati',
  acreage: 5,
  plantingDate: '2024-06-01',
  expectedHarvestDate: '2024-10-01',
  status: 'planted',
  ...overrides,
});

test('renders empty crop list with add form', () => {
  render(<CropManager crops={[]} onChange={jest.fn()} />);
  expect(screen.getByText(/Crops/)).toBeInTheDocument();
  expect(screen.getByTestId('crop-submit')).toHaveTextContent('Add Crop');
  expect(screen.getByTestId('crop-type')).toBeInTheDocument();
});

test('renders existing crops', () => {
  const crops = [makeCrop(), makeCrop({ id: '2', type: 'Wheat', variety: 'HD-2967' })];
  render(<CropManager crops={crops} onChange={jest.fn()} />);
  expect(screen.getByText(/Rice/)).toBeInTheDocument();
  expect(screen.getByText(/Wheat/)).toBeInTheDocument();
});

test('adds a new crop', async () => {
  const onChange = jest.fn();
  const user = userEvent.setup();
  render(<CropManager crops={[]} onChange={onChange} />);

  await user.type(screen.getByTestId('crop-type'), 'Rice');
  await user.type(screen.getByTestId('crop-variety'), 'Basmati');
  await user.clear(screen.getByTestId('crop-acreage'));
  await user.type(screen.getByTestId('crop-acreage'), '5');
  await user.type(screen.getByTestId('crop-planting-date'), '2024-06-01');
  await user.type(screen.getByTestId('crop-harvest-date'), '2024-10-01');

  await user.click(screen.getByTestId('crop-submit'));

  expect(onChange).toHaveBeenCalledTimes(1);
  const newCrops = onChange.mock.calls[0][0];
  expect(newCrops).toHaveLength(1);
  expect(newCrops[0].type).toBe('Rice');
  expect(newCrops[0].variety).toBe('Basmati');
});

test('shows validation errors for empty fields', async () => {
  const onChange = jest.fn();
  const user = userEvent.setup();
  render(<CropManager crops={[]} onChange={onChange} />);

  await user.click(screen.getByTestId('crop-submit'));

  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText('Crop type is required')).toBeInTheDocument();
  expect(screen.getByText('Variety is required')).toBeInTheDocument();
});

test('removes a crop with confirmation', async () => {
  const onChange = jest.fn();
  const user = userEvent.setup();
  const crops = [makeCrop()];
  render(<CropManager crops={crops} onChange={onChange} />);

  await user.click(screen.getByText(/Remove/));
  expect(screen.getByText('Remove?')).toBeInTheDocument();

  await user.click(screen.getByTestId('confirm-remove'));
  expect(onChange).toHaveBeenCalledWith([]);
});

test('cancels crop removal', async () => {
  const onChange = jest.fn();
  const user = userEvent.setup();
  render(<CropManager crops={[makeCrop()]} onChange={onChange} />);

  await user.click(screen.getByText(/Remove/));
  await user.click(screen.getByText('No'));
  expect(onChange).not.toHaveBeenCalled();
});

test('edits an existing crop', async () => {
  const onChange = jest.fn();
  const user = userEvent.setup();
  const crops = [makeCrop()];
  render(<CropManager crops={crops} onChange={onChange} />);

  await user.click(screen.getByText(/Edit/));
  expect(screen.getByText(/Edit Crop/)).toBeInTheDocument();

  const typeInput = screen.getByTestId('crop-type');
  await user.clear(typeInput);
  await user.type(typeInput, 'Wheat');
  await user.click(screen.getByTestId('crop-submit'));

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0][0].type).toBe('Wheat');
});
