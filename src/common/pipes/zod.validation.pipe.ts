import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodError, ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType<unknown>) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    let parsedValue = value;

    if (typeof value === 'string') {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
    }

    try {
      return this.schema.parse(parsedValue);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: `Validation failed for ${metadata.type}.`,
          errors: error.issues.map(issue => ({
            field: issue.path.join('.') || 'root',
            message: issue.message,
          })),
        });
      }

      throw new BadRequestException('Validation failed.');
    }
  }
}
