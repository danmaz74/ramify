// The world of the sample project: one shelf of book titles per scenario.
import { setWorldConstructor } from '@cucumber/cucumber';

export class ShelfWorld {
  books: string[] = [];
}

setWorldConstructor(ShelfWorld);
