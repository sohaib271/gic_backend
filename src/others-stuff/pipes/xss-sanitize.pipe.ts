import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { FilterXSS } from 'xss';

const blockedKeys = new Set(['__proto__', 'constructor', 'prototype']);
const sanitizer = new FilterXSS({
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
});

@Injectable()
export class XssSanitizePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (!['body', 'query', 'param'].includes(metadata.type)) {
      return value;
    }

    return this.sanitize(value);
  }

  private sanitize(value: unknown): unknown {
    if (typeof value === 'string') {
      return sanitizer.process(value).trim();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    if (value && typeof value === 'object') {
      const clean: Record<string, unknown> = {};

      for (const [key, nestedValue] of Object.entries(value)) {
        if (blockedKeys.has(key)) continue;
        clean[key] = this.sanitize(nestedValue);
      }

      return clean;
    }

    return value;
  }
}
