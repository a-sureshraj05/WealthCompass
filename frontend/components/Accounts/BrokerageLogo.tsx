import React from 'react';
import BrokerageMark from '../BrokerageMark';

export default function BrokerageLogo({ name }: { name: string }) {
  return <span className="ac-broker-logo"><BrokerageMark name={name} size={32} /></span>;
}
