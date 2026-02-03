import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Interceptor global para converter BigInt em String
 *
 * Problema: JSON.stringify() não suporta BigInt, lançando erro:
 * "Do not know how to serialize a BigInt"
 *
 * Solução: Converter recursivamente todos os BigInts para String
 * antes da serialização JSON.
 *
 * @see https://github.com/GoogleChromeLabs/jsbi/blob/master/documentation/motivation.md
 */
@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.convertBigIntToString(data)));
  }

  private convertBigIntToString(data: any): any {
    // BigInt → String
    if (typeof data === 'bigint') {
      return data.toString();
    }

    // Array → Processar cada elemento
    if (Array.isArray(data)) {
      return data.map((item) => this.convertBigIntToString(item));
    }

    // Objeto → Processar cada propriedade recursivamente
    if (data !== null && typeof data === 'object') {
      return Object.keys(data).reduce((acc, key) => {
        acc[key] = this.convertBigIntToString(data[key]);
        return acc;
      }, {} as any);
    }

    // Primitivos (string, number, boolean, null) → Retornar como está
    return data;
  }
}
