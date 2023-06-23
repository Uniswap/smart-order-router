import { QuoteService, ReturnCode } from "../../services/quote_service";
import * as Models from "../generated";
import { UserInputError, ApolloError } from "apollo-server-errors";

export const RouterResolvers = {
  Query: {
    async getQuote(_: void, args: Models.QueryGetQuoteArgs, { quoteId }: any ): Promise<Models.Quote> {
      const {  tokenInAddress, tokenOutAddress, amount, type, chain } = args.input

      if (!tokenInAddress || !tokenOutAddress || !amount || !type || !chain) {
        throw new UserInputError(
          `
            tokenInAddress, tokenOutAddress, amount, and type are required. 
            received: ${JSON.stringify(args.input)}
          `
        );
      }
    
      const quote = await QuoteService.getQuote(args.input, quoteId);
      if (!quote) {
        throw new ApolloError(`Failed to get quote for ${JSON.stringify(args.input)}`);
      } else if (quote.statusCode !== ReturnCode.OK) {
        throw new ApolloError(`${quote.statusCode}: ${quote.detail}`);
      } else if (!quote.detail) {
        throw new ApolloError(`${quote.detail}`);
      }

      return quote.detail! as Models.Quote
    },
  },
};
