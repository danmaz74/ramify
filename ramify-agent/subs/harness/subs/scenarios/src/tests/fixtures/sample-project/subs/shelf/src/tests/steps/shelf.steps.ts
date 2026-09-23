// Step definitions of the sample project's shelf module. Two definitions of
// the dusting step make it ambiguous; the sorting step is pending; nothing
// defines lending, so it is undefined.
import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { ShelfWorld } from '../../../../../src/tests/support/world.js';

Given('an empty shelf', function (this: ShelfWorld) {
  this.books = [];
});

When('the user shelves {string}', function (this: ShelfWorld, title: string) {
  this.books.push(title);
});

When('the user shelves {int} books', function (this: ShelfWorld, count: number) {
  for (let index = 0; index < count; index += 1) this.books.push(`Book ${index + 1}`);
});

When('the user dusts the shelf', function () {});

When(/^the user dusts (the|a) shelf$/, function () {});

When('the user sorts the shelf', function () {
  return 'pending';
});

Then('the shelf lists {int} book(s)', function (this: ShelfWorld, count: number) {
  assert.equal(this.books.length, count);
});
