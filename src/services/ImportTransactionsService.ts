import csvParse from 'csv-parse';
import fs from 'fs';
import { In, getCustomRepository } from 'typeorm';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionRepository from '../repositories/TransactionsRepository';
import CategoriesRepository from '../repositories/CategoriesRepository';

interface CSVTransactions {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(CSVPath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionRepository);
    const categoriesRepositorie = getCustomRepository(CategoriesRepository);

    const readCSVStream = fs.createReadStream(CSVPath);
    const parseStream = csvParse({
      from_line: 2,
    });

    const parsedCSV = readCSVStream.pipe(parseStream);

    const transactions: CSVTransactions[] = [];
    const categories: string[] = [];

    parsedCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );
      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parsedCSV.on('end', resolve));

    const existentCategories = await categoriesRepositorie.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitle = existentCategories.map(
      (category: Category) => category.title,
    );

    const nonExistentCategories = categories
      .filter(category => !existentCategoriesTitle.includes(category))
      .filter((value, index, array) => array.indexOf(value) === index);

    const newCategoriesCreated = categoriesRepositorie.create(
      nonExistentCategories.map(title => ({ title })),
    );

    await categoriesRepositorie.save(newCategoriesCreated);

    const finalCategories = [...newCategoriesCreated, ...existentCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    const transactionsCreated = await transactionsRepository.save(
      createdTransactions,
    );
    return transactionsCreated;
  }
}

export default ImportTransactionsService;
