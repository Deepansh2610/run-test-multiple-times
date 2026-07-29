import { fireEvent, render, screen } from '@testing-library/react';
import App, { isSuccessfulCompletion } from './App';

test('renders the retry runner form', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: /testrigor retry runner/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/run count/i)).toHaveValue('5');
  expect(screen.getByLabelText(/environment/i)).toHaveValue('production');
  expect(screen.getByLabelText(/suite id/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/auth token/i)).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText(/test case uuid/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'RUN' })).toBeEnabled();
});

test('recognizes terminal testcase statuses', () => {
  expect(isSuccessfulCompletion('Passed')).toBe(true);
  expect(isSuccessfulCompletion('Finished')).toBe(true);
  expect(isSuccessfulCompletion('Pending')).toBe(false);
});

test('shows a Base URL field for a custom environment', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/environment/i), { target: { value: 'custom' } });

  expect(screen.getByLabelText(/custom base url/i)).toBeInTheDocument();
});

test('creates an expandable run card and clears the submitted UUID', () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => new Promise(() => {}));
  render(<App />);

  fireEvent.change(screen.getByLabelText(/suite id/i), { target: { value: 'suite-1' } });
  fireEvent.change(screen.getByLabelText(/auth token/i), { target: { value: 'token-1' } });
  fireEvent.change(screen.getByLabelText(/environment/i), { target: { value: 'pre-production' } });
  fireEvent.change(screen.getByLabelText(/test case uuid/i), { target: { value: 'case-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'RUN' }));


  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({ baseUrl: 'https://cellar-preprod.testrigor.com/api/v1' });
  expect(screen.getByText('case-1')).toBeInTheDocument();
  expect(screen.getByText('Still running')).toBeInTheDocument();
  expect(screen.getByLabelText(/test case uuid/i)).toHaveValue('');

  fireEvent.click(screen.getByText('case-1'));
  expect(screen.getByRole('heading', { name: /run summary/i })).toBeInTheDocument();

  global.fetch = originalFetch;
});
